"""관리자 전용 — 계정 생성/관리, 한도 조정, 사용량 통계."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr

from config import settings
from db import get_conn
from deps import require_admin
from services import ledger

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
