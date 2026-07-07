"""참고 이미지 업로드 — 사용자가 첨부한 사진을 refs 버킷에 저장하고 참조 id를 돌려준다."""
from __future__ import annotations

import io
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image

from deps import get_current_user
from services import storage

router = APIRouter(prefix="/api/refs", tags=["refs"])

_MAX_BYTES = 10 * 1024 * 1024  # 10MB


@router.post("/upload")
async def upload_ref(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "이미지 파일만 올릴 수 있어요.")
    data = await file.read()
    if len(data) > _MAX_BYTES:
        raise HTTPException(400, "이미지가 너무 큽니다(최대 10MB).")
    # PNG로 정규화(형식 문제 방지)
    try:
        img = Image.open(io.BytesIO(data)).convert("RGBA")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png = buf.getvalue()
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "이미지를 읽을 수 없어요.")

    path = f"{user['id']}/{uuid.uuid4()}.png"
    await storage.upload("refs", path, png, "image/png")
    return {"ref_upload_id": path}
