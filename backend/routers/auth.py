"""인증 — Supabase Auth(GoTrue) 로그인 프록시 + 내 프로필."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from config import settings
from deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    email: EmailStr
    password: str


@router.post("/login")
async def login(body: LoginBody):
    """이메일/비밀번호 → 세션 토큰. (가입 비활성, 관리자가 만든 계정만)"""
    url = f"{settings.auth_url}/token?grant_type=password"
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            url,
            json={"email": body.email, "password": body.password},
            headers={
                "apikey": settings.SUPABASE_PUBLISHABLE_KEY,
                "Content-Type": "application/json",
            },
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")
    data = r.json()
    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token"),
        "expires_at": data.get("expires_at"),
    }


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user
