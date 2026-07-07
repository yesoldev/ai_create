"""OpenAI gpt-image-2 연동 — 생성 / 인페인팅 / 사이즈 16배수 스냅 / 카피 자동생성."""
from __future__ import annotations

import base64
import io

from openai import AsyncOpenAI
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
) -> tuple[bytes, dict, tuple[int, int]]:
    """이미지 생성. 반환: (png_bytes, usage_dict, (final_w, final_h)).

    gpt-image-2 최소 픽셀 제약 때문에 비율 유지한 채 생성 후 요청 크기로 축소.
    """
    gen_w, gen_h, fin_w, fin_h = plan_size(width, height)
    resp = await client.images.generate(
        model=model or IMAGE_MODEL,
        prompt=prompt,
        size=f"{gen_w}x{gen_h}",
        quality=quality,
        n=1,
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
) -> tuple[bytes, dict, tuple[int, int]]:
    """참고 이미지 기반 생성(변형). 참고 이미지를 입력으로 edit 호출 → 요청 크기로 축소.

    참고 이미지는 최소 픽셀 제약을 맞추기 위해 생성 크기로 리샘플해 전달한다.
    """
    gen_w, gen_h, fin_w, fin_h = plan_size(width, height)
    # 참고 이미지를 생성 크기에 맞춰 리샘플(최소 픽셀 예산 충족)
    ref_img = Image.open(io.BytesIO(ref_png)).convert("RGBA").resize((gen_w, gen_h), Image.LANCZOS)
    buf = io.BytesIO()
    ref_img.save(buf, format="PNG")
    buf.name = "reference.png"
    buf.seek(0)

    resp = await client.images.edit(
        model=model or IMAGE_MODEL,
        image=buf,
        prompt=prompt,
        size=f"{gen_w}x{gen_h}",
        n=1,
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
) -> tuple[bytes, dict]:
    """마스크 인페인팅(깨진 텍스트 부분 재생성). mask는 재생성할 영역이 투명(알파=0)."""
    img_f = io.BytesIO(image_png)
    img_f.name = "image.png"
    mask_f = io.BytesIO(mask_png)
    mask_f.name = "mask.png"
    resp = await client.images.edit(
        model=model or IMAGE_MODEL,
        image=img_f,
        mask=mask_f,
        prompt=prompt,
        n=1,
    )
    b64 = resp.data[0].b64_json
    usage = _usage_dict(resp)
    return base64.b64decode(b64), usage


async def copywrite(business: str, event: str, tone: str = "밝고 친근하게") -> list[str]:
    """업종/이벤트/톤 → 홍보 문구 후보 3~5개."""
    resp = await client.chat.completions.create(
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
    )
    text = resp.choices[0].message.content or ""
    return [ln.strip(" -•\t") for ln in text.splitlines() if ln.strip()][:5]
