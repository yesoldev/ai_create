"""OpenAI gpt-image-2 연동 — 생성 / 인페인팅 / 사이즈 16배수 스냅 / 카피 자동생성."""
from __future__ import annotations

import base64
import io

from openai import AsyncOpenAI

from config import (
    IMAGE_MODEL,
    SIZE_MAX,
    SIZE_SNAP,
    TEXT_MODEL,
    settings,
)

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


async def generate_image(
    prompt: str,
    width: int,
    height: int,
    quality: str = "medium",
    model: str | None = None,
) -> tuple[bytes, dict]:
    """이미지 생성. 반환: (png_bytes, usage_dict)."""
    w, h, _ = snap_size(width, height)
    resp = await client.images.generate(
        model=model or IMAGE_MODEL,
        prompt=prompt,
        size=f"{w}x{h}",
        quality=quality,
        n=1,
    )
    b64 = resp.data[0].b64_json
    usage = _usage_dict(resp)
    return base64.b64decode(b64), usage


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
        quality=quality,
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
