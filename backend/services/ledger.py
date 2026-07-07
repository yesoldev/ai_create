"""사용량/한도 원장 — 월 누적 집계, 잔여 한도, 사용 기록."""
from __future__ import annotations

from datetime import datetime, timezone


def current_year_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def month_total_krw(conn, user_id: str, year_month: str | None = None) -> float:
    ym = year_month or current_year_month()
    row = conn.execute(
        "select total_cost_krw from public.usage_monthly where user_id=%s and year_month=%s",
        (user_id, ym),
    ).fetchone()
    return float(row["total_cost_krw"]) if row else 0.0


def remaining_krw(conn, user: dict) -> float | None:
    """잔여 한도(KRW). 한도 무제한(monthly_limit_krw=None)이면 None."""
    limit = user["monthly_limit_krw"]
    if limit is None:
        return None
    used = month_total_krw(conn, user["id"])
    return max(0.0, float(limit) - used)


def add_usage(conn, user_id: str, cost_krw: float) -> None:
    """월 누적에 비용 가산(upsert)."""
    ym = current_year_month()
    conn.execute(
        "insert into public.usage_monthly (user_id, year_month, total_cost_krw) "
        "values (%s, %s, %s) "
        "on conflict (user_id, year_month) "
        "do update set total_cost_krw = public.usage_monthly.total_cost_krw + excluded.total_cost_krw",
        (user_id, ym, cost_krw),
    )
