"""템플릿 CRUD — Fabric.js 캔버스 JSON + 프롬프트 저장/재사용."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from db import get_conn
from deps import get_current_user
from services import storage

router = APIRouter(prefix="/api/templates", tags=["templates"])


def _with_thumb(row: dict) -> dict:
    if row.get("thumb_path"):
        row["thumb_url"] = storage.public_url("thumbs", row["thumb_path"])
    return row


@router.get("")
async def list_templates(folder_id: str | None = Query(None), user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        if folder_id:
            rows = conn.execute(
                "select id, folder_id, name, size_w, size_h, dpi, thumb_path, updated_at "
                "from public.templates where folder_id=%s order by updated_at desc",
                (folder_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "select id, folder_id, name, size_w, size_h, dpi, thumb_path, updated_at "
                "from public.templates order by updated_at desc limit 100"
            ).fetchall()
    return {"items": [_with_thumb(r) for r in rows]}


class TemplateBody(BaseModel):
    folder_id: str | None = None
    name: str
    canvas_json: dict | None = None
    prompt: str | None = None
    size_w: int | None = None
    size_h: int | None = None
    dpi: int = 300
    bg_image_path: str | None = None
    thumb_path: str | None = None
    generation_id: str | None = None  # 있으면 원본/썸네일 경로 자동 연결


@router.post("")
async def create(body: TemplateBody, user: dict = Depends(get_current_user)):
    import json

    bg_image_path = body.bg_image_path
    thumb_path = body.thumb_path
    # 생성물과 연결: 원본(results) 경로 + 썸네일(thumbs) 경로 자동 설정
    if body.generation_id:
        with get_conn() as conn:
            g = conn.execute(
                "select id, user_id, result_path from public.generations where id=%s",
                (body.generation_id,),
            ).fetchone()
        if g:
            bg_image_path = bg_image_path or g["result_path"]
            thumb_path = thumb_path or f"{g['user_id']}/{g['id']}.jpg"

    with get_conn() as conn:
        row = conn.execute(
            "insert into public.templates "
            "(folder_id, name, canvas_json, prompt, size_w, size_h, dpi, bg_image_path, thumb_path, created_by) "
            "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id",
            (body.folder_id, body.name,
             json.dumps(body.canvas_json) if body.canvas_json is not None else None,
             body.prompt, body.size_w, body.size_h, body.dpi,
             bg_image_path, thumb_path, user["id"]),
        ).fetchone()
    return {"id": row["id"]}


@router.get("/{tid}")
async def get_template(tid: str, user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        row = conn.execute("select * from public.templates where id=%s", (tid,)).fetchone()
    if not row:
        raise HTTPException(404, "템플릿을 찾을 수 없습니다.")
    _with_thumb(row)
    if row.get("bg_image_path"):
        try:
            row["bg_url"] = await storage.signed_url("results", row["bg_image_path"])
        except Exception:  # noqa: BLE001
            row["bg_url"] = None
    return row


class TemplatePatch(BaseModel):
    name: str | None = None
    canvas_json: dict | None = None
    folder_id: str | None = None
    size_w: int | None = None
    size_h: int | None = None
    move_to_root: bool = False  # folder_id 를 null 로 만들기


@router.patch("/{tid}")
async def update(tid: str, body: TemplatePatch, user: dict = Depends(get_current_user)):
    """부분 업데이트 — 전달된 필드만 갱신(배경/썸네일 등 미전달 필드는 보존)."""
    import json

    sets: list[str] = []
    params: list = []
    if body.name is not None:
        sets.append("name=%s")
        params.append(body.name)
    if body.canvas_json is not None:
        sets.append("canvas_json=%s")
        params.append(json.dumps(body.canvas_json))
    if body.move_to_root:
        sets.append("folder_id=NULL")
    elif body.folder_id is not None:
        sets.append("folder_id=%s")
        params.append(body.folder_id)
    if body.size_w is not None:
        sets.append("size_w=%s")
        params.append(body.size_w)
    if body.size_h is not None:
        sets.append("size_h=%s")
        params.append(body.size_h)
    if not sets:
        raise HTTPException(400, "변경할 내용이 없습니다.")
    params.append(tid)
    with get_conn() as conn:
        row = conn.execute(
            f"update public.templates set {', '.join(sets)} where id=%s returning id", params
        ).fetchone()
    if not row:
        raise HTTPException(404, "템플릿을 찾을 수 없습니다.")
    return {"id": row["id"]}


@router.post("/{tid}/copy")
async def copy(tid: str, user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        row = conn.execute(
            "insert into public.templates "
            "(folder_id, name, canvas_json, prompt, size_w, size_h, dpi, bg_image_path, thumb_path, created_by) "
            "select folder_id, name || ' (복사본)', canvas_json, prompt, size_w, size_h, dpi, "
            "bg_image_path, thumb_path, %s from public.templates where id=%s returning id",
            (user["id"], tid),
        ).fetchone()
    if not row:
        raise HTTPException(404, "템플릿을 찾을 수 없습니다.")
    return {"id": row["id"]}


@router.delete("/{tid}")
async def delete(tid: str, user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        conn.execute("delete from public.templates where id=%s", (tid,))
    return {"ok": True}
