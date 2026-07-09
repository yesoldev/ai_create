"""앱 설정 — 배너/전단지 기본 사이즈(관리자 설정). presets 테이블에 저장(마이그레이션 불필요)."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from db import get_conn
from deps import get_current_user, require_admin

router = APIRouter(prefix="/api/settings", tags=["settings"])

# 관리자가 설정 안 했을 때의 기본값
_FALLBACK = {"banner": {"w": 1024, "h": 400}, "flyer": {"w": 900, "h": 1500}}
_PRESET_TYPE = "style"
_PRESET_NAME = "default_sizes"


def _read() -> dict:
    with get_conn() as conn:
        row = conn.execute(
            "select payload from public.presets where type=%s and name=%s limit 1",
            (_PRESET_TYPE, _PRESET_NAME),
        ).fetchone()
    p = row["payload"] if row else None
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
    with get_conn() as conn:
        row = conn.execute(
            "select id from public.presets where type=%s and name=%s limit 1",
            (_PRESET_TYPE, _PRESET_NAME),
        ).fetchone()
        if row:
            conn.execute(
                "update public.presets set payload=%s where id=%s",
                (json.dumps(payload), row["id"]),
            )
        else:
            conn.execute(
                "insert into public.presets (type, name, payload) values (%s,%s,%s)",
                (_PRESET_TYPE, _PRESET_NAME, json.dumps(payload)),
            )
    return payload
