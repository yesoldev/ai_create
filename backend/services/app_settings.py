"""앱 전역 설정(관리자가 정함) — presets 테이블(type='style')에 이름별 payload로 저장(마이그레이션 불필요).

- default_sizes : 배너/전단지 기본 크기
- image_model   : 모든 직원의 그림 생성에 쓰는 이미지 모델
"""
from __future__ import annotations

import json
import time

from config import IMAGE_MODEL, IMAGE_MODEL_CHOICES
from db import get_conn

_TYPE = "style"


def read(name: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "select payload from public.presets where type=%s and name=%s limit 1",
            (_TYPE, name),
        ).fetchone()
    p = row["payload"] if row else None
    return p if isinstance(p, dict) else None


def write(name: str, payload: dict) -> None:
    with get_conn() as conn:
        row = conn.execute(
            "select id from public.presets where type=%s and name=%s limit 1",
            (_TYPE, name),
        ).fetchone()
        if row:
            conn.execute("update public.presets set payload=%s where id=%s", (json.dumps(payload), row["id"]))
        else:
            conn.execute(
                "insert into public.presets (type, name, payload) values (%s,%s,%s)",
                (_TYPE, name, json.dumps(payload)),
            )


# ───────── 이미지 모델 ─────────
# 생성마다 DB를 읽지 않도록 잠깐 기억한다. 관리자가 바꾸면 이 프로세스에선 즉시 반영.
_MODEL_TTL = 30.0
_model_cache: tuple[str, float] | None = None


def image_model() -> str:
    """지금 쓰는 이미지 모델. 설정이 없거나 허용 목록 밖이면 기본 모델."""
    global _model_cache
    now = time.monotonic()
    if _model_cache and now - _model_cache[1] < _MODEL_TTL:
        return _model_cache[0]
    p = read("image_model") or {}
    m = p.get("model")
    model = m if m in IMAGE_MODEL_CHOICES else IMAGE_MODEL
    _model_cache = (model, now)
    return model


def set_image_model(model: str) -> str:
    global _model_cache
    if model not in IMAGE_MODEL_CHOICES:
        raise ValueError(model)
    write("image_model", {"model": model})
    _model_cache = (model, time.monotonic())
    return model
