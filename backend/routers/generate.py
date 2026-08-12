"""생성 — 이미지 생성 / 인페인팅 / 카피 자동생성 / 생성 이력.

Phase 1: 프롬프트+사이즈+품질 생성, 한도 사전 체크, Storage 저장, 비용 기록.
참고이미지·유사도·배경 프리셋·레이어 모드는 Phase 2에서 확장(요청 필드는 미리 수용).
"""
from __future__ import annotations

import asyncio
import base64
import logging
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import get_conn
from deps import get_current_user
from services import cost, ledger, openai_client, sizing, storage

router = APIRouter(prefix="/api", tags=["generate"])
logger = logging.getLogger("generate")

_MM_PER_INCH = 25.4

# 글자 규칙 — 모델이 문구를 제멋대로 바꾸거나 지어내는 것을 막는다.
# (자유도 변주·그림체 변경이 걸려도 글자는 절대 변주 대상이 아니다)
_TEXT_RULES = (
    "\n\n[글자 규칙 — 반드시 지킬 것]\n"
    "1) 그림에 넣을 글자는 아래 '넣을 문구'가 전부다. 여기 없는 글자·문장·숫자·영어·상호·"
    "전화번호·주소·로고·워터마크를 절대 새로 지어내 넣지 마.\n"
    "2) 맞춤법·띄어쓰기·줄바꿈을 한 글자도 바꾸지 말고 그대로 옮겨 적어.\n"
    "3) 문구는 빠짐없이 전부, 잘리거나 뭉개지지 않게 또렷하게 넣어.\n"
    "4) 구도·색·그림체가 어떻게 바뀌든 글자 내용은 절대 바꾸지 마.\n\n"
    '넣을 문구:\n"{text}"'
)
_NO_TEXT_RULE = (
    "\n\n[글자 규칙] 그림 안에 글자를 넣지 마. 상호·문장·숫자·영어 등 어떤 글자도 지어내지 말고 "
    "그림만 그려줘."
)
_KEEP_TEXT_RULE = (
    "\n\n[글자 규칙] 참고 이미지에 있는 글자는 내용·맞춤법을 그대로 유지하고, "
    "요청하지 않은 새 글자·문장·숫자·영어를 지어내 넣지 마."
)


def _ai_http_error(e: openai_client.AiError) -> HTTPException:
    """AI 오류 → 한글 메시지가 담긴 HTTP 오류.

    detail은 {code, message} 형태. 프론트는 code로 분기(moderation이면 자동 재시도)하고
    message를 그대로 보여준다. 안전 검사 차단은 422, 나머지는 502.
    """
    status = 422 if e.code == "moderation" else 502
    return HTTPException(status, detail={"code": e.code, "message": e.message})

# 유사도(1~4)에 따른 프롬프트 접두 — 모델에 강도 파라미터가 없어 문구로 근사(계획 §3.1)
_SIMILARITY_PREFIX = {
    1: "아래 참고 이미지의 느낌만 살짝 참고해 새롭게 만들어줘.",
    2: "아래 참고 이미지와 비슷한 분위기로 다시 만들어줘.",
    3: "아래 참고 이미지의 구도와 색감을 비슷하게 유지하며 다시 만들어줘.",
    4: "아래 참고 이미지를 거의 그대로 유지하되 아주 조금만 다르게 만들어줘.",
}


def apply_text_rules(prompt: str, mode: str, text_content: str | None, has_ref: bool) -> str:
    """프롬프트 끝에 글자 규칙을 붙인다(가장 뒤 = 가장 강하게 걸린다).

    - 넣을 문구가 있으면: 그 문구만 정확히, 다른 글자는 지어내지 말 것
    - 문구가 없고 참고 이미지가 있으면(편집기 AI 수정 등): 원래 글자를 지킬 것
    - 문구도 참고 이미지도 없으면: 글자를 아예 넣지 말 것
    """
    if mode != "ai_text":
        return prompt
    if text_content:
        return prompt + _TEXT_RULES.format(text=text_content)
    return prompt + (_KEEP_TEXT_RULE if has_ref else _NO_TEXT_RULE)


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
    name: str | None = None       # 사용자가 정한 제목(있으면 프로젝트명으로 사용)
    kind: str | None = None       # banner | flyer (문구 배치 방식 참고용)
    template_id: str | None = None  # 있으면 새 프로젝트 대신 이 프로젝트의 이미지를 갱신
    # 안전 검사에 막혀 프론트가 다시 시도할 때 올려 보내는 단계(0=원본, 1~2=안전 조건 추가)
    safety_level: int = Field(default=0, ge=0, le=openai_client.SAFETY_MAX_LEVEL)
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

    # 1) 사전 한도 체크 (실제 생성 크기 기준)
    gen_w, gen_h, _, _ = sizing.plan_size(w, h)
    with get_conn() as conn:
        remaining = ledger.remaining_krw(conn, user)
    est = cost.estimate_cost_krw(gen_w, gen_h, body.quality)
    if body.ref_generation_id or body.ref_upload_id:
        est *= 2  # 참고 이미지 입력 토큰(high fidelity 과금) 대략 반영
    if remaining is not None and est > remaining:
        raise HTTPException(
            status_code=402,
            detail=f"이번 달 한도가 부족합니다. 예상 {est:,.0f}원 / 잔여 {remaining:,.0f}원",
        )

    prompt = body.prompt

    # 참고 이미지 준비 (이전 생성물 또는 첨부 업로드)
    ref_path = None
    ref_bytes = None
    ref_bucket = None
    if body.ref_generation_id:
        with get_conn() as conn:
            rg = conn.execute(
                "select result_path from public.generations where id=%s and user_id=%s",
                (body.ref_generation_id, user["id"]),
            ).fetchone()
        if rg:
            ref_path, ref_bucket = rg["result_path"], "results"
    elif body.ref_upload_id:
        ref_path, ref_bucket = body.ref_upload_id, "refs"

    if ref_path and ref_bucket:
        try:
            ref_url = await storage.signed_url(ref_bucket, ref_path)
            async with httpx.AsyncClient(timeout=60) as hc:
                ref_bytes = (await hc.get(ref_url)).content
        except Exception:  # noqa: BLE001
            ref_bytes = None
        prompt = f"{_SIMILARITY_PREFIX.get(body.similarity or 2)} {prompt}"

    # 2) 글자 규칙 — 프롬프트 맨 끝에 붙여 가장 강하게 걸리게 한다.
    #    (배치 방식은 프론트가 kind에 맞춰 이미 지시하고, 여기서는 '무슨 글자를 넣을지'만 못박는다)
    prompt = apply_text_rules(prompt, body.mode, body.text_content, bool(ref_path))

    # 3) 생성 (참고 있으면 변형 생성, 없으면 신규. 최소 픽셀 처리 후 요청 크기로 축소)
    try:
        if ref_bytes:
            png, usage, (w, h) = await openai_client.generate_from_reference(
                ref_bytes, prompt, w, h, body.quality, safety_level=body.safety_level
            )
        else:
            png, usage, (w, h) = await openai_client.generate_image(
                prompt, w, h, body.quality, safety_level=body.safety_level
            )
    except openai_client.AiError as e:
        # 원문 오류는 openai_client가 이미 로그로 남겼다. 여기선 요청 맥락만 덧붙인다.
        logger.warning(
            "이미지 생성 실패(%s) user=%s ref=%s size=%sx%s quality=%s safety=%s",
            e.code, user.get("id"), bool(ref_bytes), w, h, body.quality, body.safety_level,
        )
        raise _ai_http_error(e) from e
    except Exception as e:  # noqa: BLE001  (이미지 후처리 등 예상 밖 오류)
        logger.exception("이미지 생성 실패(예상 밖) user=%s", user.get("id"))
        raise _ai_http_error(
            openai_client.AiError("그림을 만드는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.")
        ) from e

    # 4) 실제 비용
    cost_krw = cost.actual_cost_krw(usage) or est

    # 5) Storage 저장(원본 + 썸네일)
    gid = str(uuid.uuid4())
    result_path = f"{user['id']}/{gid}.png"
    thumb_path = f"{user['id']}/{gid}.jpg"
    await storage.upload("results", result_path, png, "image/png")
    await storage.upload("thumbs", thumb_path, storage.make_thumbnail(png), "image/jpeg")

    # 6) 프로젝트(템플릿) — 제목 우선순위: 사용자 입력 name > 문구 > 프롬프트
    project_name = (body.name or body.text_content or body.prompt or "새 홍보물").strip()[:30] or "새 홍보물"
    with get_conn() as conn:
        # template_id 가 오면 기존 프로젝트에 '새 페이지'를 추가(편집기 'AI로 수정'),
        # 아니면 새 프로젝트 생성 + 1페이지.
        existing = None
        if body.template_id:
            existing = conn.execute(
                "select id, name from public.templates where id=%s and created_by=%s",
                (body.template_id, user["id"]),
            ).fetchone()
        if existing:
            project_id = existing["id"]
            project_name = existing["name"] or project_name
            # 구 데이터(페이지 행 없음) 안전 백필: 기존 대표 이미지를 0페이지로
            conn.execute(
                "insert into public.template_pages (template_id, sort_order, bg_image_path, thumb_path, canvas_json) "
                "select id, 0, bg_image_path, thumb_path, canvas_json from public.templates "
                "where id=%s and not exists (select 1 from public.template_pages p where p.template_id=%s)",
                (project_id, project_id),
            )
            nxt = conn.execute(
                "select coalesce(max(sort_order), -1) + 1 as n from public.template_pages where template_id=%s",
                (project_id,),
            ).fetchone()["n"]
            page = conn.execute(
                "insert into public.template_pages (template_id, sort_order, bg_image_path, thumb_path, canvas_json) "
                "values (%s,%s,%s,%s,%s) returning id",
                (project_id, nxt, result_path, thumb_path, None),
            ).fetchone()
            # 프로젝트 대표 썸네일을 최신 페이지로(홈/보관함 표시용). updated_at은 트리거가 갱신.
            conn.execute("update public.templates set thumb_path=%s where id=%s", (thumb_path, project_id))
            page_id = page["id"]
        else:
            prow = conn.execute(
                "insert into public.templates "
                "(name, canvas_json, prompt, size_w, size_h, dpi, bg_image_path, thumb_path, created_by) "
                "values (%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id",
                (project_name, None, prompt, w, h, body.dpi, result_path, thumb_path, user["id"]),
            ).fetchone()
            project_id = prow["id"]
            page = conn.execute(
                "insert into public.template_pages (template_id, sort_order, bg_image_path, thumb_path, canvas_json) "
                "values (%s,0,%s,%s,%s) returning id",
                (project_id, result_path, thumb_path, None),
            ).fetchone()
            page_id = page["id"]
        conn.execute(
            "insert into public.generations "
            "(id, user_id, template_id, prompt, model, quality, size, ref_image_path, result_path, cost_krw) "
            "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (gid, user["id"], project_id, prompt, openai_client.IMAGE_MODEL,
             body.quality, f"{w}x{h}", ref_path, result_path, cost_krw),
        )
        ledger.add_usage(conn, user["id"], cost_krw)
        remaining_after = ledger.remaining_krw(conn, user)

    image_url = await storage.signed_url("results", result_path)
    return {
        "generation_id": gid,
        "project_id": project_id,
        "project_name": project_name,
        "page_id": page_id,
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
    safety_level: int = Field(default=0, ge=0, le=openai_client.SAFETY_MAX_LEVEL)


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
        png, usage = await openai_client.inpaint_image(
            src, mask, body.prompt, body.quality, safety_level=body.safety_level
        )
    except openai_client.AiError as e:
        logger.warning("부분 재생성 실패(%s) user=%s", e.code, user.get("id"))
        raise _ai_http_error(e) from e
    except Exception as e:  # noqa: BLE001
        logger.exception("부분 재생성 실패(예상 밖) user=%s", user.get("id"))
        raise _ai_http_error(
            openai_client.AiError("고쳐 그리는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.")
        ) from e

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
    try:
        candidates, usage = await openai_client.copywrite(body.business, body.event, body.tone)
    except openai_client.AiError as e:
        logger.warning("문구 추천 실패(%s) user=%s", e.code, user.get("id"))
        raise _ai_http_error(e) from e
    cost_krw = cost.copy_cost_krw(usage)
    with get_conn() as conn:
        if cost_krw > 0:
            ledger.add_usage(conn, user["id"], cost_krw)
        remaining_after = ledger.remaining_krw(conn, user)
    return {"candidates": candidates, "cost_krw": cost_krw, "remaining_krw": remaining_after}


@router.get("/generations")
async def my_generations(user: dict = Depends(get_current_user), limit: int = 30):
    with get_conn() as conn:
        rows = conn.execute(
            "select id, template_id, prompt, quality, size, cost_krw, result_path, created_at "
            "from public.generations where user_id=%s order by created_at desc limit %s",
            (user["id"], min(limit, 100)),
        ).fetchall()

    async def enrich(r: dict) -> None:
        r["thumb_url"] = storage.public_url("thumbs", f"{user['id']}/{r['id']}.jpg")
        try:
            r["image_url"] = await storage.signed_url("results", r["result_path"])
        except Exception:  # noqa: BLE001
            r["image_url"] = None

    await asyncio.gather(*(enrich(r) for r in rows))
    return {"items": rows}
