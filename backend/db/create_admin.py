"""첫 관리자 계정 생성 유틸 (가입 비활성이므로 부트스트랩용).

사용:
  backend/.venv/Scripts/python.exe backend/db/create_admin.py <email> <password> [name]
Supabase Auth에 계정을 만들고 public.users에 role=admin 으로 등록한다.
"""
from __future__ import annotations

import pathlib
import sys

import httpx
import psycopg

ROOT = pathlib.Path(__file__).resolve().parents[2]


def load_env(path: pathlib.Path) -> dict:
    env = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def main() -> int:
    if len(sys.argv) < 3:
        print("사용법: create_admin.py <email> <password> [name]", file=sys.stderr)
        return 2
    email, password = sys.argv[1], sys.argv[2]
    name = sys.argv[3] if len(sys.argv) > 3 else None

    env = load_env(ROOT / ".env")
    base = env["SUPABASE_URL"]
    secret = env["SUPABASE_SECRET_KEY"]
    headers = {"Authorization": f"Bearer {secret}", "apikey": secret, "Content-Type": "application/json"}

    r = httpx.post(
        f"{base}/auth/v1/admin/users",
        headers=headers,
        json={"email": email, "password": password, "email_confirm": True},
        timeout=20,
    )
    if r.status_code not in (200, 201):
        print(f"Auth 계정 생성 실패: {r.status_code} {r.text}", file=sys.stderr)
        return 1
    uid = r.json()["id"]

    with psycopg.connect(env["DATABASE_URL"], autocommit=True) as conn:
        conn.execute(
            "insert into public.users (id, email, name, role, monthly_limit_krw) "
            "values (%s,%s,%s,'admin', NULL) "
            "on conflict (id) do update set role='admin', is_active=true",
            (uid, email, name),
        )
    print(f"관리자 생성 완료: {email} (id={uid}, 한도=무제한)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
