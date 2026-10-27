"""앱 설정 — 배너/전단지 기본 사이즈·이미지 모델(관리자 설정), 계정별로 마지막에 고른 크기."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import IMAGE_MODEL, IMAGE_MODEL_CHOICES
from db import get_conn
from deps import get_current_user, require_admin
from services import app_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])

# 관리자가 설정 안 했을 때의 기본값
_FALLBACK = {"banner": {"w": 1024, "h": 400}, "flyer": {"w": 900, "h": 1500}}


def _read() -> dict:
    p = app_settings.read("default_sizes")
    out = {k: dict(v) for k, v in _FALLBACK.items()}
    if isinstance(p, dict):
        for k in ("banner", "flyer"):
            v = p.get(k)
            if isinstance(v, dict) and v.get("w") and v.get("h"):
                out[k] = {"w": int(v["w"]), "h": int(v["h"])}
    return out


@router.get("/default-sizes")
async def get_default_sizes(user: dict = Depends(get_current_user)):
    return _read()


class SizesBody(BaseModel):
    banner_w: int = Field(ge=16, le=3840)
    banner_h: int = Field(ge=16, le=3840)
    flyer_w: int = Field(ge=16, le=3840)
    flyer_h: int = Field(ge=16, le=3840)


@router.patch("/default-sizes")
async def set_default_sizes(body: SizesBody, admin: dict = Depends(require_admin)):
    payload = {
        "banner": {"w": body.banner_w, "h": body.banner_h},
        "flyer": {"w": body.flyer_w, "h": body.flyer_h},
    }
    app_settings.write("default_sizes", payload)
    return payload


# ───────── 이미지 모델(관리자) — 모든 직원의 생성에 적용 ─────────
@router.get("/image-model")
async def get_image_model(admin: dict = Depends(require_admin)):
    return {"model": app_settings.image_model(), "default": IMAGE_MODEL, "choices": list(IMAGE_MODEL_CHOICES)}


class ModelBody(BaseModel):
    model: str


@router.patch("/image-model")
async def set_image_model(body: ModelBody, admin: dict = Depends(require_admin)):
    try:
        model = app_settings.set_image_model(body.model)
    except ValueError:
        raise HTTPException(400, "선택할 수 없는 AI 모델입니다.") from None
    return {"model": model}


# ───────── 계정별로 마지막에 고른 크기(배너·전단지 따로) ─────────
@router.get("/my-sizes")
async def get_my_sizes(user: dict = Depends(get_current_user)):
    """{banner?: {mode, preset_key?, custom:{w,h,unit}}, flyer?: ...} — 스튜디오가 다음 생성 때 미리 골라 둔다."""
    with get_conn() as conn:
        row = conn.execute("select size_prefs from public.users where id=%s", (user["id"],)).fetchone()
    p = row["size_prefs"] if row else None
    return p if isinstance(p, dict) else {}
