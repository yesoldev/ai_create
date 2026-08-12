"""템플릿 CRUD — Fabric.js 캔버스 JSON + 프롬프트 저장/재사용."""
from __future__ import annotations

import io
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from PIL import Image
from pydantic import BaseModel

from db import get_conn
from deps import get_current_user
from services import storage

router = APIRouter(prefix="/api/templates", tags=["templates"])


def _with_thumb(row: dict) -> dict:
    if row.get("thumb_path"):
        row["thumb_url"] = storage.public_url("thumbs", row["thumb_path"])
    return row


@router.post("/upload")
async def upload_project(
    file: UploadFile = File(...),
    name: str | None = Form(None),
    folder_id: str | None = Form(None),
    user: dict = Depends(get_current_user),
):
    """이미지 파일(png/jpg)을 올려 새 프로젝트(1페이지)로 만든다. AI 생성 없음(무과금)."""
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "이미지 파일만 올릴 수 있어요.")
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(400, "이미지가 너무 큽니다(최대 20MB).")
    try:
        img = Image.open(io.BytesIO(data))
        w, h = img.size
        buf = io.BytesIO()
        img.convert("RGBA").save(buf, format="PNG")
        png = buf.getvalue()
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "이미지를 읽을 수 없어요.")

    gid = str(uuid.uuid4())
    result_path = f"{user['id']}/{gid}.png"
    thumb_path = f"{user['id']}/{gid}.jpg"
    await storage.upload("results", result_path, png, "image/png")
    await storage.upload("thumbs", thumb_path, storage.make_thumbnail(png), "image/jpeg")

    base = (name or file.filename or "").rsplit(".", 1)[0].strip()
    project_name = base[:30] or "올린 홍보물"
    with get_conn() as conn:
        prow = conn.execute(
            "insert into public.templates "
            "(folder_id, name, canvas_json, prompt, size_w, size_h, dpi, bg_image_path, thumb_path, created_by) "
            "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id",
            (folder_id, project_name, None, None, w, h, 300, result_path, thumb_path, user["id"]),
        ).fetchone()
        pid = prow["id"]
        page = conn.execute(
            "insert into public.template_pages (template_id, sort_order, bg_image_path, thumb_path, canvas_json) "
            "values (%s,0,%s,%s,%s) returning id",
            (pid, result_path, thumb_path, None),
        ).fetchone()

    return {
        "project_id": pid,
        "page_id": page["id"],
        "name": project_name,
        "size_w": w,
        "size_h": h,
        "image_url": await storage.signed_url("results", result_path),
        "thumb_url": storage.public_url("thumbs", thumb_path),
    }


@router.get("")
async def list_templates(folder_id: str | None = Query(None), user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        if folder_id:
            rows = conn.execute(
                "select id, folder_id, name, size_w, size_h, dpi, thumb_path, updated_at "
                "from public.templates where folder_id=%s and created_by=%s order by updated_at desc",
                (folder_id, user["id"]),
            ).fetchall()
        else:
            rows = conn.execute(
                "select id, folder_id, name, size_w, size_h, dpi, thumb_path, updated_at "
                "from public.templates where created_by=%s order by updated_at desc limit 100",
                (user["id"],),
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
    import asyncio

    with get_conn() as conn:
        row = conn.execute(
            "select * from public.templates where id=%s and created_by=%s", (tid, user["id"])
        ).fetchone()
        if not row:
            raise HTTPException(404, "템플릿을 찾을 수 없습니다.")
        pages = conn.execute(
            "select id, sort_order, bg_image_path, thumb_path, canvas_json "
            "from public.template_pages where template_id=%s order by sort_order, created_at",
            (tid,),
        ).fetchall()

    _with_thumb(row)
    if row.get("bg_image_path"):
        try:
            row["bg_url"] = await storage.signed_url("results", row["bg_image_path"])
        except Exception:  # noqa: BLE001
            row["bg_url"] = None

    # 페이지가 없으면(구 데이터 안전망) 템플릿 자체를 1페이지로 취급
    if not pages:
        pages = [{
            "id": None,
            "sort_order": 0,
            "bg_image_path": row.get("bg_image_path"),
            "thumb_path": row.get("thumb_path"),
            "canvas_json": row.get("canvas_json"),
        }]

    async def sign(p: dict) -> None:
        if p.get("thumb_path"):
            p["thumb_url"] = storage.public_url("thumbs", p["thumb_path"])
        if p.get("bg_image_path"):
            try:
                p["bg_url"] = await storage.signed_url("results", p["bg_image_path"])
            except Exception:  # noqa: BLE001
                p["bg_url"] = None

    await asyncio.gather(*(sign(p) for p in pages))
    row["pages"] = pages
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
    params.extend([tid, user["id"]])
    with get_conn() as conn:
        row = conn.execute(
            f"update public.templates set {', '.join(sets)} where id=%s and created_by=%s returning id",
            params,
        ).fetchone()
    if not row:
        raise HTTPException(404, "템플릿을 찾을 수 없습니다.")
    return {"id": row["id"]}


class PageCanvas(BaseModel):
    id: str
    canvas_json: dict | None = None


class PagesSaveBody(BaseModel):
    pages: list[PageCanvas]


@router.put("/{tid}/pages")
async def save_pages(tid: str, body: PagesSaveBody, user: dict = Depends(get_current_user)):
    """페이지별 오버레이(canvas_json) 저장 — 편집기 '보관함에 저장' 시 전체 페이지 반영."""
    import json

    with get_conn() as conn:
        owner = conn.execute(
            "select 1 from public.templates where id=%s and created_by=%s", (tid, user["id"])
        ).fetchone()
        if not owner:
            raise HTTPException(404, "프로젝트를 찾을 수 없습니다.")
        for p in body.pages:
            conn.execute(
                "update public.template_pages set canvas_json=%s where id=%s and template_id=%s",
                (json.dumps(p.canvas_json) if p.canvas_json is not None else None, p.id, tid),
            )
    return {"ok": True}


@router.post("/{tid}/pages/image")
async def add_page_image(
    tid: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """이미지를 올려 이 프로젝트의 '새 페이지'로 추가(편집기 자르기 결과). AI 생성 없음(무과금).

    원본 페이지는 그대로 두므로 자르기를 되돌리고 싶으면 이전 페이지를 쓰면 된다.
    """
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "이미지 파일만 올릴 수 있어요.")
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(400, "이미지가 너무 큽니다(최대 20MB).")
    try:
        img = Image.open(io.BytesIO(data))
        w, h = img.size
        buf = io.BytesIO()
        img.convert("RGBA").save(buf, format="PNG")
        png = buf.getvalue()
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "이미지를 읽을 수 없어요.")

    with get_conn() as conn:
        owner = conn.execute(
            "select id from public.templates where id=%s and created_by=%s", (tid, user["id"])
        ).fetchone()
    if not owner:
        raise HTTPException(404, "프로젝트를 찾을 수 없습니다.")

    gid = str(uuid.uuid4())
    result_path = f"{user['id']}/{gid}.png"
    thumb_path = f"{user['id']}/{gid}.jpg"
    await storage.upload("results", result_path, png, "image/png")
    await storage.upload("thumbs", thumb_path, storage.make_thumbnail(png), "image/jpeg")

    with get_conn() as conn:
        # 구 데이터(페이지 행 없음) 안전 백필: 기존 대표 이미지를 0페이지로
        conn.execute(
            "insert into public.template_pages (template_id, sort_order, bg_image_path, thumb_path, canvas_json) "
            "select id, 0, bg_image_path, thumb_path, canvas_json from public.templates "
            "where id=%s and not exists (select 1 from public.template_pages p where p.template_id=%s)",
            (tid, tid),
        )
        nxt = conn.execute(
            "select coalesce(max(sort_order), -1) + 1 as n from public.template_pages where template_id=%s",
            (tid,),
        ).fetchone()["n"]
        page = conn.execute(
            "insert into public.template_pages (template_id, sort_order, bg_image_path, thumb_path, canvas_json) "
            "values (%s,%s,%s,%s,%s) returning id",
            (tid, nxt, result_path, thumb_path, None),
        ).fetchone()
        # 보관함 목록에는 최신 페이지를 대표로 보여준다(생성 시와 동일 규칙)
        conn.execute("update public.templates set thumb_path=%s where id=%s", (thumb_path, tid))

    return {
        "page_id": page["id"],
        "sort_order": nxt,
        "size_w": w,
        "size_h": h,
        "image_url": await storage.signed_url("results", result_path),
        "thumb_url": storage.public_url("thumbs", thumb_path),
    }


@router.delete("/{tid}/pages/{page_id}")
async def delete_page(tid: str, page_id: str, user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        owner = conn.execute(
            "select 1 from public.templates where id=%s and created_by=%s", (tid, user["id"])
        ).fetchone()
        if not owner:
            raise HTTPException(404, "프로젝트를 찾을 수 없습니다.")
        cnt = conn.execute(
            "select count(*) as c from public.template_pages where template_id=%s", (tid,)
        ).fetchone()["c"]
        if cnt <= 1:
            raise HTTPException(400, "마지막 페이지는 지울 수 없습니다.")
        conn.execute(
            "delete from public.template_pages where id=%s and template_id=%s", (page_id, tid)
        )
    return {"ok": True}


@router.post("/{tid}/copy")
async def copy(tid: str, user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        row = conn.execute(
            "insert into public.templates "
            "(folder_id, name, canvas_json, prompt, size_w, size_h, dpi, bg_image_path, thumb_path, created_by) "
            "select folder_id, name || ' (복사본)', canvas_json, prompt, size_w, size_h, dpi, "
            "bg_image_path, thumb_path, %s from public.templates where id=%s and created_by=%s returning id",
            (user["id"], tid, user["id"]),
        ).fetchone()
    if not row:
        raise HTTPException(404, "템플릿을 찾을 수 없습니다.")
    return {"id": row["id"]}


@router.delete("/{tid}")
async def delete(tid: str, user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        conn.execute("delete from public.templates where id=%s and created_by=%s", (tid, user["id"]))
    return {"ok": True}
