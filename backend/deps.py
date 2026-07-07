"""인증 의존성 — Supabase JWT(비대칭 서명 키)를 JWKS로 검증하고 프로필을 로드한다."""
from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import settings
from db import get_conn

bearer = HTTPBearer(auto_error=True)

# JWKS 키 캐시 (엔드포인트를 매 요청 호출하지 않도록)
_jwks_client = jwt.PyJWKClient(settings.jwks_url)


def _decode(token: str) -> dict:
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            issuer=f"{settings.SUPABASE_URL}/auth/v1",
            options={"require": ["exp", "sub"]},
            leeway=60,  # 로컬/서버 시계 오차(clock skew) 허용 — iat/nbf/exp 60초
        )
    except jwt.PyJWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"토큰 검증 실패: {e}",
        )


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
) -> dict:
    """검증된 사용자 프로필(dict) 반환. 없거나 비활성이면 401/403."""
    claims = _decode(creds.credentials)
    uid = claims["sub"]
    with get_conn() as conn:
        row = conn.execute(
            "select id, email, name, role, is_active, monthly_limit_krw "
            "from public.users where id = %s",
            (uid,),
        ).fetchone()
    if not row:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "등록되지 않은 사용자입니다.")
    if not row["is_active"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "비활성화된 계정입니다.")
    return row


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "관리자 권한이 필요합니다.")
    return user
