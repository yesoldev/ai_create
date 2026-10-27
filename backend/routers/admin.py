"""관리자 전용 — 계정 생성/관리, 한도 조정, 사용량 통계."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr

from config import settings
from db import get_conn
from deps import require_admin
from services import ledger, storage
from services.prompt_view import inputs_of

router = APIRouter(prefix="/api/admin", tags=["admin"])

_ADMIN_HEADERS = {
    "Authorization": f"Bearer {settings.SUPABASE_SECRET_KEY}",
    "apikey": settings.SUPABASE_SECRET_KEY,
    "Content-Type": "application/json",
}


@router.get("/users")
async def list_users(admin: dict = Depends(require_admin)):
    ym = ledger.current_year_month()
    with get_conn() as conn:
        rows = conn.execute(
            "select u.id, u.email, u.name, u.role, u.is_active, u.monthly_limit_krw, "
            "coalesce(m.total_cost_krw, 0) as used_krw "
            "from public.users u "
            "left join public.usage_monthly m on m.user_id=u.id and m.year_month=%s "
            "order by u.created_at",
            (ym,),
        ).fetchall()
    return {"year_month": ym, "items": rows}


class CreateUser(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None
    role: str = "user"
    monthly_limit_krw: int | None = 15000


@router.post("/users")
async def create_user(body: CreateUser, admin: dict = Depends(require_admin)):
    """Supabase Auth에 계정 생성(이메일 확인 처리) 후 프로필 등록."""
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            f"{settings.auth_url}/admin/users",
            headers=_ADMIN_HEADERS,
            json={"email": body.email, "password": body.password, "email_confirm": True},
        )
    if r.status_code not in (200, 201):
        raise HTTPException(400, f"계정 생성 실패: {r.text}")
    uid = r.json()["id"]
    with get_conn() as conn:
        conn.execute(
            "insert into public.users (id, email, name, role, monthly_limit_krw) "
            "values (%s,%s,%s,%s,%s)",
            (uid, body.email, body.name, body.role, body.monthly_limit_krw),
        )
    return {"id": uid, "email": body.email}


class PatchUser(BaseModel):
    is_active: bool | None = None
    monthly_limit_krw: int | None = None  # None 전송 시 무제한으로 두려면 unlimited 사용
    unlimited: bool | None = None
    role: str | None = None


@router.patch("/users/{uid}")
async def patch_user(uid: str, body: PatchUser, admin: dict = Depends(require_admin)):
    sets, params = [], []
    if body.is_active is not None:
        sets.append("is_active=%s")
        params.append(body.is_active)
    if body.role is not None:
        sets.append("role=%s")
        params.append(body.role)
    if body.unlimited:
        sets.append("monthly_limit_krw=NULL")
    elif body.monthly_limit_krw is not None:
        sets.append("monthly_limit_krw=%s")
        params.append(body.monthly_limit_krw)
    if not sets:
        raise HTTPException(400, "변경할 내용이 없습니다.")
    params.append(uid)
    with get_conn() as conn:
        row = conn.execute(
            f"update public.users set {', '.join(sets)} where id=%s returning id",
            params,
        ).fetchone()
    if not row:
        raise HTTPException(404, "사용자를 찾을 수 없습니다.")
    return {"id": uid}


@router.get("/usage")
async def usage_stats(month: str = Query(None), admin: dict = Depends(require_admin)):
    ym = month or ledger.current_year_month()
    with get_conn() as conn:
        rows = conn.execute(
            "select u.email, u.name, coalesce(m.total_cost_krw,0) as used_krw, u.monthly_limit_krw "
            "from public.users u "
            "left join public.usage_monthly m on m.user_id=u.id and m.year_month=%s "
            "order by used_krw desc",
            (ym,),
        ).fetchall()
        total = conn.execute(
            "select coalesce(sum(total_cost_krw),0) as t from public.usage_monthly where year_month=%s",
            (ym,),
        ).fetchone()["t"]
    return {"year_month": ym, "total_krw": float(total), "items": rows}


@router.get("/users/{uid}/generations")
async def user_generations(
    uid: str, limit: int = Query(60, ge=1, le=200), offset: int = Query(0, ge=0),
    admin: dict = Depends(require_admin),
):
    """직원이 만든 그림 목록(최신순) — 관리자가 보고 조언해 주는 용도."""
    with get_conn() as conn:
        u = conn.execute("select id, email, name from public.users where id=%s", (uid,)).fetchone()
        if not u:
            raise HTTPException(404, "사용자를 찾을 수 없습니다.")
        rows = conn.execute(
            "select g.id, g.created_at, g.prompt, g.user_input, g.model, g.quality, g.size, g.cost_krw, "
            "g.ref_image_path is not null as has_ref, t.name as project_name "
            "from public.generations g left join public.templates t on t.id=g.template_id "
            "where g.user_id=%s order by g.created_at desc limit %s offset %s",
            (uid, limit + 1, offset),
        ).fetchall()
    items = []
    for r in rows[:limit]:
        items.append({
            "id": r["id"],
            "created_at": r["created_at"],
            "project_name": r["project_name"],
            "model": r["model"],
            "quality": r["quality"],
            "size": r["size"],
            "cost_krw": r["cost_krw"],
            "has_ref": r["has_ref"],
            "inputs": inputs_of(r),
            "thumb_url": storage.public_url("thumbs", f"{uid}/{r['id']}.jpg"),
        })
    return {"user": u, "items": items, "has_more": len(rows) > limit}


@router.get("/generations/{gid}")
async def generation_detail(gid: str, admin: dict = Depends(require_admin)):
    """한 장의 자세한 내용 — 원본 이미지 + 직원 입력 + AI에 실제로 보낸 전체 문장."""
    with get_conn() as conn:
        r = conn.execute(
            "select g.*, t.name as project_name from public.generations g "
            "left join public.templates t on t.id=g.template_id where g.id=%s",
            (gid,),
        ).fetchone()
    if not r:
        raise HTTPException(404, "기록을 찾을 수 없습니다.")
    try:
        image_url = await storage.signed_url("results", r["result_path"]) if r["result_path"] else None
    except Exception:  # noqa: BLE001
        image_url = None
    return {
        "id": r["id"],
        "created_at": r["created_at"],
        "project_name": r["project_name"],
        "model": r["model"],
        "quality": r["quality"],
        "size": r["size"],
        "cost_krw": r["cost_krw"],
        "has_ref": r["ref_image_path"] is not None,
        "inputs": inputs_of(r),
        "inputs_recorded": bool(r["user_input"]),  # False면 예전 기록에서 뽑아낸 것
        "prompt": r["prompt"],
        "image_url": image_url,
    }
