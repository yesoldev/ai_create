"""비용 계산 · 한도 체크.

- 사전 예상비용: 사이즈×품질 앵커값을 픽셀 면적으로 스케일 (생성 버튼 옆 / "앞으로 N장" 표시용)
- 실제 비용: OpenAI 응답 usage 토큰 × 단가 → USD → 고정 환율로 KRW 환산
"""
from __future__ import annotations

import math

from config import (
    ESTIMATE_USD_1024,
    PRICE_CHAT_INPUT_PER_MTOK,
    PRICE_CHAT_OUTPUT_PER_MTOK,
    PRICE_IMAGE_INPUT_PER_MTOK,
    PRICE_IMAGE_OUTPUT_PER_MTOK,
    PRICE_TEXT_INPUT_PER_MTOK,
    settings,
)

_AREA_1024 = 1024 * 1024


def estimate_cost_krw(width: int, height: int, quality: str) -> float:
    """생성 전 예상 비용(KRW). 앵커(1024²) 대비 면적 비례로 근사."""
    base_usd = ESTIMATE_USD_1024.get(quality, ESTIMATE_USD_1024["medium"])
    area_ratio = (width * height) / _AREA_1024
    usd = base_usd * area_ratio
    return round(usd * settings.USD_KRW_RATE, 2)


def actual_cost_krw(usage: dict | None) -> float:
    """OpenAI 이미지 응답의 usage 토큰으로 실제 비용(KRW) 계산.

    usage 예: {input_tokens, output_tokens, input_tokens_details:{text_tokens,image_tokens}}
    """
    if not usage:
        return 0.0
    out_tok = usage.get("output_tokens", 0) or 0
    details = usage.get("input_tokens_details", {}) or {}
    text_tok = details.get("text_tokens", 0) or 0
    img_tok = details.get("image_tokens", 0) or 0
    # details가 없으면 input_tokens 전체를 텍스트로 간주(보수적)
    if not details and usage.get("input_tokens"):
        text_tok = usage["input_tokens"]

    usd = (
        out_tok * PRICE_IMAGE_OUTPUT_PER_MTOK
        + img_tok * PRICE_IMAGE_INPUT_PER_MTOK
        + text_tok * PRICE_TEXT_INPUT_PER_MTOK
    ) / 1_000_000
    return round(usd * settings.USD_KRW_RATE, 2)


def copy_cost_krw(usage: dict | None) -> float:
    """카피라이팅(chat) 응답 usage 토큰으로 실제 비용(KRW) 계산."""
    if not usage:
        return 0.0
    pt = usage.get("prompt_tokens", 0) or 0
    ct = usage.get("completion_tokens", 0) or 0
    usd = (pt * PRICE_CHAT_INPUT_PER_MTOK + ct * PRICE_CHAT_OUTPUT_PER_MTOK) / 1_000_000
    return round(usd * settings.USD_KRW_RATE, 2)


def remaining_images(remaining_krw: float | None, width: int, height: int, quality: str) -> int | None:
    """잔여 한도로 해당 품질/사이즈 이미지를 앞으로 몇 장 만들 수 있는지.

    한도 무제한(None)이면 None 반환.
    """
    if remaining_krw is None:
        return None
    per = estimate_cost_krw(width, height, quality)
    if per <= 0:
        return None
    return max(0, math.floor(remaining_krw / per))
