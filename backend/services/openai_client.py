"""OpenAI gpt-image-2 연동 — 생성 / 인페인팅 / 사이즈 16배수 스냅 / 카피 자동생성."""
from __future__ import annotations

import base64
import io
import logging
from collections.abc import Awaitable, Callable

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    AuthenticationError,
    BadRequestError,
    PermissionDeniedError,
    RateLimitError,
)
from PIL import Image

from config import (
    IMAGE_MODEL,
    SIZE_MAX,
    SIZE_SNAP,
    TEXT_MODEL,
    settings,
)
from services.sizing import plan_size

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
logger = logging.getLogger("openai_client")


class AiError(Exception):
    """사용자에게 그대로 보여줄 한글 메시지를 담은 AI 호출 오류.

    code: 프론트가 분기하는 용도(moderation이면 자동 재시도 대상).
    """

    def __init__(self, message: str, *, code: str = "unknown") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


class ModerationBlocked(AiError):
    """OpenAI 안전 검사(입력/출력)가 막은 경우. 재시도하면 통과하는 오탐이 잦다."""

    def __init__(self, message: str = "OpenAI 안전 검사에 걸렸어요.") -> None:
        super().__init__(message, code="moderation")


# 안전 검사 대응 문구 — 출력 단계 차단은 '결과 이미지'를 보고 일어나서 재현성이 낮다.
# 같은 프롬프트에 안전 조건을 덧붙여 다시 시도하면 대개 통과한다.
# safety_level(0/1/2)로 강도를 올린다. 재시도는 사용자에게 진행 상황을 보여주려고
# 프론트가 주도한다(백엔드가 조용히 3번 돌면 90초 동안 아무 안내도 못 준다).
SAFETY_GUARDS: tuple[str, ...] = (
    "",
    "\n\n[필수 조건] 전 연령이 볼 수 있는 건전한 상업 광고 이미지로 만든다. "
    "인물이 등장한다면 반드시 옷을 단정하게 갖춰 입고 노출이 전혀 없어야 하며, "
    "선정적이거나 신체 부위를 강조하는 포즈·구도·클로즈업을 쓰지 않는다.",
    "\n\n[필수 조건] 사람(인물)을 절대 그리지 않는다. 제품·사물·배경·도형·글자만으로 "
    "구성된 건전한 상업 광고 이미지로 만든다.",
)
SAFETY_MAX_LEVEL = len(SAFETY_GUARDS) - 1


def with_guard(prompt: str, safety_level: int = 0) -> str:
    """안전 검사 재시도 단계에 맞는 안전 조건 문구를 덧붙인다."""
    return prompt + SAFETY_GUARDS[max(0, min(safety_level, SAFETY_MAX_LEVEL))]


def _is_moderation_block(e: Exception) -> bool:
    if getattr(e, "code", None) == "moderation_blocked":
        return True
    msg = str(e)
    return "moderation_blocked" in msg or "safety system" in msg


def _translate(e: Exception) -> AiError:
    """OpenAI SDK 예외 → 사용자용 한글 메시지. 원문은 호출부에서 로그로 남긴다."""
    if _is_moderation_block(e):
        return ModerationBlocked()
    if isinstance(e, RateLimitError):
        return AiError(
            "지금 AI 서버에 요청이 많이 몰려 있어요. 1~2분 뒤에 다시 시도해 주세요.",
            code="rate_limit",
        )
    if isinstance(e, APITimeoutError):
        return AiError(
            "AI 서버 응답이 너무 오래 걸려 중단됐어요. 잠시 후 다시 시도해 주세요.",
            code="timeout",
        )
    if isinstance(e, APIConnectionError):
        return AiError(
            "AI 서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.",
            code="connection",
        )
    if isinstance(e, (AuthenticationError, PermissionDeniedError)):
        return AiError(
            "AI 서비스 이용 권한에 문제가 있어요. 관리자에게 문의해 주세요.",
            code="auth",
        )
    if isinstance(e, BadRequestError):
        return AiError(
            "AI가 이 요청을 처리하지 못했어요. 설명을 조금 더 쉽고 짧게 바꿔 다시 시도해 주세요.",
            code="bad_request",
        )
    if isinstance(e, APIStatusError) and e.status_code >= 500:
        return AiError(
            "AI 서버에 일시적인 문제가 있어요. 잠시 후 다시 시도해 주세요.",
            code="server",
        )
    return AiError("그림을 만드는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.", code="unknown")


async def _call(what: str, factory: Callable[[], Awaitable]):
    """OpenAI 호출을 감싸 원문은 로그로, 사용자에겐 한글 메시지로."""
    try:
        return await factory()
    except Exception as e:  # noqa: BLE001
        err = _translate(e)
        if err.code == "moderation":
            logger.warning("안전검사 차단(%s): %s", what, e)
        else:
            logger.exception("OpenAI 호출 실패(%s)", what)
        raise err from e


def _usage_dict(resp) -> dict:
    """응답의 usage를 dict로 안전 추출 (SDK 버전에 따라 pydantic/ dict 혼재)."""
    u = getattr(resp, "usage", None)
    if u is None:
        return {}
    if hasattr(u, "model_dump"):
        return u.model_dump()
    if isinstance(u, dict):
        return u
    return {}


def snap_size(width: int, height: int) -> tuple[int, int, bool]:
    """요청 px을 16배수로 스냅하고 최대치로 clamp.

    반환: (스냅된 w, 스냅된 h, 업스케일_필요_여부)
    업스케일 필요 = 원래 요청이 SIZE_MAX를 초과해 잘린 경우.
    """
    def snap(v: int) -> int:
        return max(SIZE_SNAP, round(v / SIZE_SNAP) * SIZE_SNAP)

    upscale = width > SIZE_MAX or height > SIZE_MAX
    w = min(snap(width), SIZE_MAX)
    h = min(snap(height), SIZE_MAX)
    return w, h, upscale


def _resize_png(png: bytes, w: int, h: int) -> bytes:
    img = Image.open(io.BytesIO(png)).convert("RGBA")
    img = img.resize((w, h), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


async def generate_image(
    prompt: str,
    width: int,
    height: int,
    quality: str = "medium",
    model: str | None = None,
    safety_level: int = 0,
) -> tuple[bytes, dict, tuple[int, int]]:
    """이미지 생성. 반환: (png_bytes, usage_dict, (final_w, final_h)).

    gpt-image-2 최소 픽셀 제약 때문에 비율 유지한 채 생성 후 요청 크기로 축소.
    safety_level은 안전 검사 재시도 단계(0~2) — 높을수록 강한 안전 조건을 덧붙인다.
    """
    gen_w, gen_h, fin_w, fin_h = plan_size(width, height)
    resp = await _call(
        "생성",
        lambda: client.images.generate(
            model=model or IMAGE_MODEL,
            prompt=with_guard(prompt, safety_level),
            size=f"{gen_w}x{gen_h}",
            quality=quality,
            n=1,
        ),
    )
    usage = _usage_dict(resp)
    png = base64.b64decode(resp.data[0].b64_json)
    if (gen_w, gen_h) != (fin_w, fin_h):
        png = _resize_png(png, fin_w, fin_h)
    return png, usage, (fin_w, fin_h)


async def generate_from_reference(
    ref_png: bytes,
    prompt: str,
    width: int,
    height: int,
    quality: str = "medium",
    model: str | None = None,
    safety_level: int = 0,
) -> tuple[bytes, dict, tuple[int, int]]:
    """참고 이미지 기반 생성(변형). 참고 이미지를 입력으로 edit 호출 → 요청 크기로 축소.

    참고 이미지는 최소 픽셀 제약을 맞추기 위해 생성 크기로 리샘플해 전달한다.
    """
    gen_w, gen_h, fin_w, fin_h = plan_size(width, height)
    # 참고 이미지는 원본 비율·해상도 그대로 보낸다.
    #  - 출력 크기는 size 인자가 결정하므로 입력을 늘릴 필요가 없다(2026-08-12 실측 확인).
    #  - 예전처럼 출력 크기에 맞춰 늘리면 (1) 확대로 화질이 뭉개져 'AI로 수정'을 반복할수록
    #    나빠지고 (2) 비율이 찌그러져 참고 이미지의 구도가 그대로 새 크기에 눌려 나온다.
    #  - 상한(SIZE_MAX)만 넘지 않게 줄인다(입력 토큰 = 비용).
    ref_img = Image.open(io.BytesIO(ref_png)).convert("RGBA")
    longest = max(ref_img.size)
    if longest > SIZE_MAX:
        s = SIZE_MAX / longest
        ref_img = ref_img.resize((max(1, round(ref_img.width * s)), max(1, round(ref_img.height * s))), Image.LANCZOS)
    buf = io.BytesIO()
    ref_img.save(buf, format="PNG")
    buf.name = "reference.png"
    buf.seek(0)

    resp = await _call(
        "참고이미지 변형",
        lambda: client.images.edit(
            model=model or IMAGE_MODEL,
            image=buf,
            prompt=with_guard(prompt, safety_level),
            size=f"{gen_w}x{gen_h}",
            quality=quality,  # 구 SDK에선 edit에 못 넘겼다(openai 3.x부터 가능)
            n=1,
        ),
    )
    usage = _usage_dict(resp)
    png = base64.b64decode(resp.data[0].b64_json)
    if (gen_w, gen_h) != (fin_w, fin_h):
        png = _resize_png(png, fin_w, fin_h)
    return png, usage, (fin_w, fin_h)


async def inpaint_image(
    image_png: bytes,
    mask_png: bytes,
    prompt: str,
    quality: str = "medium",
    model: str | None = None,
    safety_level: int = 0,
) -> tuple[bytes, dict]:
    """마스크 인페인팅(깨진 텍스트 부분 재생성). mask는 재생성할 영역이 투명(알파=0)."""
    img_f = io.BytesIO(image_png)
    img_f.name = "image.png"
    mask_f = io.BytesIO(mask_png)
    mask_f.name = "mask.png"

    resp = await _call(
        "부분 재생성",
        lambda: client.images.edit(
            model=model or IMAGE_MODEL,
            image=img_f,
            mask=mask_f,
            prompt=with_guard(prompt, safety_level),
            quality=quality,
            n=1,
        ),
    )
    b64 = resp.data[0].b64_json
    usage = _usage_dict(resp)
    return base64.b64decode(b64), usage


async def copywrite(business: str, event: str, tone: str = "밝고 친근하게") -> tuple[list[str], dict]:
    """업종/이벤트/톤 → 홍보 문구 후보 3~5개. 반환: (후보목록, usage_dict)."""
    resp = await _call(
        "문구 추천",
        lambda: client.chat.completions.create(
            model=TEXT_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "너는 한국어 홍보물 카피라이터다. 짧고 임팩트 있는 문구를 만든다. "
                    "각 후보는 한 줄, 번호 없이 줄바꿈으로만 구분해 5개 출력.",
                },
                {
                    "role": "user",
                    "content": f"업종: {business}\n이벤트/행사: {event}\n톤: {tone}\n"
                    "배너/전단지 헤드라인 문구 5개를 제안해줘.",
                },
            ],
            temperature=0.9,
        ),
    )
    text = resp.choices[0].message.content or ""
    candidates = [ln.strip(" -•\t") for ln in text.splitlines() if ln.strip()][:5]
    return candidates, _usage_dict(resp)
