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


@router.post("")
async def create(body: TemplateBody, user: dict = Depends(get_current_user)):
    import json

    with get_conn() as conn:
        row = conn.execute(
            "insert into public.templates "
            "(folder_id, name, canvas_json, prompt, size_w, size_h, dpi, bg_image_path, thumb_path, created_by) "
            "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id",
            (body.folder_id, body.name,
             json.dumps(body.canvas_json) if body.canvas_json is not None else None,
             body.prompt, body.size_w, body.size_h, body.dpi,
             body.bg_image_path, body.thumb_path, user["id"]),
        ).fetchone()
    return {"id": row["id"]}


@router.get("/{tid}")
async def get_template(tid: str, user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        row = conn.execute("select * from public.templates where id=%s", (tid,)).fetchone()
    if not row:
        raise HTTPException(404, "템플릿을 찾을 수 없습니다.")
    return _with_thumb(row)


@router.patch("/{tid}")
async def update(tid: str, body: TemplateBody, user: dict = Depends(get_current_user)):
    import json

    with get_conn() as conn:
        row = conn.execute(
            "update public.templates set folder_id=%s, name=%s, canvas_json=%s, prompt=%s, "
            "size_w=%s, size_h=%s, dpi=%s, bg_image_path=%s, thumb_path=%s where id=%s returning id",
            (body.folder_id, body.name,
             json.dumps(body.canvas_json) if body.canvas_json is not None else None,
             body.prompt, body.size_w, body.size_h, body.dpi,
             body.bg_image_path, body.thumb_path, tid),
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
