"""생성 — 이미지 생성 / 인페인팅 / 카피 자동생성 / 생성 이력.

Phase 1: 프롬프트+사이즈+품질 생성, 한도 사전 체크, Storage 저장, 비용 기록.
참고이미지·유사도·배경 프리셋·레이어 모드는 Phase 2에서 확장(요청 필드는 미리 수용).
"""
from __future__ import annotations

import base64
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import get_conn
from deps import get_current_user
from services import cost, ledger, openai_client, storage

router = APIRouter(prefix="/api", tags=["generate"])

_MM_PER_INCH = 25.4


def to_px(value: float, unit: str, dpi: int) -> int:
    if unit == "px":
        return int(round(value))
    if unit == "mm":
        return int(round(value * dpi / _MM_PER_INCH))
    if unit == "cm":
        return int(round(value * 10 * dpi / _MM_PER_INCH))
    raise HTTPException(400, f"알 수 없는 단위: {unit}")


class GenerateBody(BaseModel):
    prompt: str
    width: float
    height: float
    unit: str = "px"              # px | mm | cm
    dpi: int = 300
    quality: str = "medium"       # low | medium | high
    mode: str = "ai_text"         # layer | ai_text
    text_content: str | None = None
    # Phase 2 확장(수용만):
    bg_preset_id: str | None = None
    ref_generation_id: str | None = None
    ref_upload_id: str | None = None
    similarity: int | None = Field(default=None, ge=1, le=4)
    folder_id: str | None = None


@router.post("/generate")
async def generate(body: GenerateBody, user: dict = Depends(get_current_user)):
    w = to_px(body.width, body.unit, body.dpi)
    h = to_px(body.height, body.unit, body.dpi)

    # 1) 사전 한도 체크
    with get_conn() as conn:
        remaining = ledger.remaining_krw(conn, user)
    est = cost.estimate_cost_krw(w, h, body.quality)
    if remaining is not None and est > remaining:
        raise HTTPException(
            status_code=402,
            detail=f"이번 달 한도가 부족합니다. 예상 {est:,.0f}원 / 잔여 {remaining:,.0f}원",
        )

    # 2) AI 합성 모드면 문구를 프롬프트에 주입
    prompt = body.prompt
    if body.mode == "ai_text" and body.text_content:
        prompt = f'{prompt}\n\n다음 한글 문구를 정확히 큼직하게 넣어줘: "{body.text_content}"'

    # 3) 생성
    try:
        png, usage = await openai_client.generate_image(prompt, w, h, body.quality)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"이미지 생성 실패: {e}")

    # 4) 실제 비용
    cost_krw = cost.actual_cost_krw(usage) or est

    # 5) Storage 저장(원본 + 썸네일)
    gid = str(uuid.uuid4())
    result_path = f"{user['id']}/{gid}.png"
    thumb_path = f"{user['id']}/{gid}.jpg"
    await storage.upload("results", result_path, png, "image/png")
    await storage.upload("thumbs", thumb_path, storage.make_thumbnail(png), "image/jpeg")

    # 6) 기록 + 사용량 가산
    with get_conn() as conn:
        conn.execute(
            "insert into public.generations "
            "(id, user_id, template_id, prompt, model, quality, size, result_path, cost_krw) "
            "values (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (gid, user["id"], None, prompt, openai_client.IMAGE_MODEL,
             body.quality, f"{w}x{h}", result_path, cost_krw),
        )
        ledger.add_usage(conn, user["id"], cost_krw)
        remaining_after = ledger.remaining_krw(conn, user)

    image_url = await storage.signed_url("results", result_path)
    return {
        "generation_id": gid,
        "image_url": image_url,
        "thumb_url": storage.public_url("thumbs", thumb_path),
        "size": f"{w}x{h}",
        "cost_krw": cost_krw,
        "remaining_krw": remaining_after,
    }


class InpaintBody(BaseModel):
    generation_id: str
    mask_png_base64: str
    prompt: str
    quality: str = "medium"


@router.post("/generate/inpaint")
async def inpaint(body: InpaintBody, user: dict = Depends(get_current_user)):
    """깨진 텍스트 부분 재생성(마스크 인페인팅)."""
    with get_conn() as conn:
        row = conn.execute(
            "select result_path, size from public.generations where id=%s and user_id=%s",
            (body.generation_id, user["id"]),
        ).fetchone()
    if not row:
        raise HTTPException(404, "원본 생성 이미지를 찾을 수 없습니다.")

    # 원본 내려받기(서명 URL)
    import httpx  # 지역 임포트: 인페인팅 시에만 사용

    src_url = await storage.signed_url("results", row["result_path"])
    async with httpx.AsyncClient(timeout=60) as c:
        src = (await c.get(src_url)).content
    mask = base64.b64decode(body.mask_png_base64)

    try:
        png, usage = await openai_client.inpaint_image(src, mask, body.prompt, body.quality)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"부분 재생성 실패: {e}")

    cost_krw = cost.actual_cost_krw(usage)
    gid = str(uuid.uuid4())
    result_path = f"{user['id']}/{gid}.png"
    await storage.upload("results", result_path, png, "image/png")
    with get_conn() as conn:
        conn.execute(
            "insert into public.generations (id, user_id, prompt, model, quality, size, result_path, cost_krw) "
            "values (%s,%s,%s,%s,%s,%s,%s,%s)",
            (gid, user["id"], body.prompt, openai_client.IMAGE_MODEL,
             body.quality, row["size"], result_path, cost_krw),
        )
        ledger.add_usage(conn, user["id"], cost_krw)

    return {
        "generation_id": gid,
        "image_url": await storage.signed_url("results", result_path),
        "cost_krw": cost_krw,
    }


class CopyBody(BaseModel):
    business: str
    event: str
    tone: str = "밝고 친근하게"


@router.post("/copywrite")
async def copywrite(body: CopyBody, user: dict = Depends(get_current_user)):
    candidates = await openai_client.copywrite(body.business, body.event, body.tone)
    return {"candidates": candidates}


@router.get("/generations")
async def my_generations(user: dict = Depends(get_current_user), limit: int = 30):
    with get_conn() as conn:
        rows = conn.execute(
            "select id, prompt, quality, size, cost_krw, result_path, created_at "
            "from public.generations where user_id=%s order by created_at desc limit %s",
            (user["id"], min(limit, 100)),
        ).fetchall()
    for r in rows:
        r["thumb_url"] = storage.public_url("thumbs", f"{user['id']}/{r['id']}.jpg")
    return {"items": rows}
