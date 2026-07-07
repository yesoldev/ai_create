"""schema.sql 을 DATABASE_URL(.env) 로 Supabase에 적용한다.
사용: backend/.venv/Scripts/python.exe backend/db/apply_schema.py
"""
import os
import pathlib
import sys

import psycopg

ROOT = pathlib.Path(__file__).resolve().parents[2]


def load_env(path: pathlib.Path) -> dict:
    env = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def main() -> int:
    env = load_env(ROOT / ".env")
    dsn = env.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL 이 .env 에 없습니다.", file=sys.stderr)
        return 1
    sql = (ROOT / "backend" / "db" / "schema.sql").read_text(encoding="utf-8")
    with psycopg.connect(dsn, connect_timeout=15, autocommit=True) as conn:
        conn.execute(sql)  # 파라미터 없음 → 다중 문장 실행 가능
        print("스키마 적용 완료.")
        # 검증: 생성된 테이블/버킷 확인
        tables = conn.execute(
            "select table_name from information_schema.tables "
            "where table_schema='public' order by table_name"
        ).fetchall()
        print("public 테이블:", ", ".join(t[0] for t in tables))
        buckets = conn.execute("select id, public from storage.buckets order by id").fetchall()
        print("Storage 버킷:", ", ".join(f"{b[0]}({'공개' if b[1] else '비공개'})" for b in buckets))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
