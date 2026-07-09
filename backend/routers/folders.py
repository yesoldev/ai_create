"""템플릿 트리 폴더 CRUD."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from db import get_conn
from deps import get_current_user

router = APIRouter(prefix="/api/folders", tags=["folders"])


@router.get("/tree")
async def tree(user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        rows = conn.execute(
            "select id, parent_id, name, sort_order from public.folders "
            "where created_by=%s order by sort_order, name",
            (user["id"],),
        ).fetchall()
    return {"items": rows}


class FolderBody(BaseModel):
    parent_id: str | None = None
    name: str


@router.post("")
async def create(body: FolderBody, user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        row = conn.execute(
            "insert into public.folders (parent_id, name, created_by) values (%s,%s,%s) "
            "returning id, parent_id, name, sort_order",
            (body.parent_id, body.name, user["id"]),
        ).fetchone()
    return row


class FolderPatch(BaseModel):
    name: str | None = None
    parent_id: str | None = None


@router.patch("/{fid}")
async def update(fid: str, body: FolderPatch, user: dict = Depends(get_current_user)):
    sets, params = [], []
    if body.name is not None:
        sets.append("name=%s")
        params.append(body.name)
    if body.parent_id is not None:
        sets.append("parent_id=%s")
        params.append(body.parent_id)
    if not sets:
        raise HTTPException(400, "변경할 내용이 없습니다.")
    params.extend([fid, user["id"]])
    with get_conn() as conn:
        row = conn.execute(
            f"update public.folders set {', '.join(sets)} where id=%s and created_by=%s "
            "returning id, parent_id, name, sort_order",
            params,
        ).fetchone()
    if not row:
        raise HTTPException(404, "폴더를 찾을 수 없습니다.")
    return row


@router.delete("/{fid}")
async def delete(fid: str, force: bool = Query(False), user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        owner = conn.execute(
            "select 1 from public.folders where id=%s and created_by=%s", (fid, user["id"])
        ).fetchone()
        if not owner:
            raise HTTPException(404, "폴더를 찾을 수 없습니다.")
        n_sub = conn.execute(
            "select count(*) as n from public.folders where parent_id=%s", (fid,)
        ).fetchone()["n"]
        n_tpl = conn.execute(
            "select count(*) as n from public.templates where folder_id=%s", (fid,)
        ).fetchone()["n"]
        if (n_sub or n_tpl) and not force:
            raise HTTPException(
                409, f"폴더에 하위 항목이 있습니다(하위폴더 {n_sub}, 템플릿 {n_tpl}). 확인 후 재요청."
            )
        conn.execute("delete from public.folders where id=%s and created_by=%s", (fid, user["id"]))
    return {"ok": True}
