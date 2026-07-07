"""Supabase Storage 업로드 · 썸네일 생성(Pillow) · URL 발급."""
from __future__ import annotations

import io

import httpx
from PIL import Image

from config import settings

_HEADERS = {
    "Authorization": f"Bearer {settings.SUPABASE_SECRET_KEY}",
    "apikey": settings.SUPABASE_SECRET_KEY,
}


async def upload(bucket: str, path: str, data: bytes, content_type: str = "image/png") -> str:
    """버킷에 업로드(덮어쓰기). 반환: 저장 경로(path)."""
    url = f"{settings.storage_url}/object/{bucket}/{path}"
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            url,
            content=data,
            headers={**_HEADERS, "Content-Type": content_type, "x-upsert": "true"},
        )
        r.raise_for_status()
    return path


def make_thumbnail(image_bytes: bytes, max_px: int = 512) -> bytes:
    """긴 변 max_px로 축소한 JPG 썸네일 바이트."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img.thumbnail((max_px, max_px))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=85)
    return out.getvalue()


def public_url(bucket: str, path: str) -> str:
    """공개 버킷(thumbs 등)의 공개 URL."""
    return f"{settings.storage_url}/object/public/{bucket}/{path}"


async def signed_url(bucket: str, path: str, expires_sec: int = 3600) -> str:
    """비공개 버킷(results/refs)의 서명 URL."""
    url = f"{settings.storage_url}/object/sign/{bucket}/{path}"
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(url, json={"expiresIn": expires_sec}, headers=_HEADERS)
        r.raise_for_status()
        signed = r.json()["signedURL"]
    return f"{settings.storage_url}{signed}"
