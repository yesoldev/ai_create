"""사용량/한도 — 내 잔여 한도, 생성 옵션별 예상 비용 + 앞으로 N장."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from db import get_conn
from deps import get_current_user
from services import cost, ledger, sizing

router = APIRouter(prefix="/api/usage", tags=["usage"])


@router.get("/me")
async def my_usage(user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        used = ledger.month_total_krw(conn, user["id"])
        remaining = ledger.remaining_krw(conn, user)
    return {
        "year_month": ledger.current_year_month(),
        "monthly_limit_krw": user["monthly_limit_krw"],  # None = 무제한
        "used_krw": used,
        "remaining_krw": remaining,  # None = 무제한
    }


@router.get("/estimate")
async def estimate(
    width: int = Query(..., ge=16),
    height: int = Query(..., ge=16),
    quality: str = Query("medium"),
    user: dict = Depends(get_current_user),
):
    """생성 버튼 옆/품질 선택 시: 예상 비용 + 이 계정 앞으로 몇 장 가능한지."""
    # 실제 생성 크기(최소 픽셀 제약 반영) 기준으로 비용 산정
    gen_w, gen_h, _, _ = sizing.plan_size(width, height)
    with get_conn() as conn:
        remaining = ledger.remaining_krw(conn, user)
    per = cost.estimate_cost_krw(gen_w, gen_h, quality)
    return {
        "quality": quality,
        "estimated_cost_krw": per,
        "remaining_krw": remaining,  # None = 무제한
        "remaining_images": cost.remaining_images(remaining, gen_w, gen_h, quality),  # None = 무제한
    }
