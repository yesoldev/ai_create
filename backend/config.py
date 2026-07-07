"""전역 설정 · 단가/환율/한도 상수.

단가는 여기 한 곳에서만 관리한다. 변경 시 주석의 출처(기준일)도 갱신할 것.
"""
from __future__ import annotations

import pathlib

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = pathlib.Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- OpenAI ---
    OPENAI_API_KEY: str

    # --- Supabase ---
    SUPABASE_URL: str
    SUPABASE_PROJECT_ID: str = ""
    SUPABASE_PUBLISHABLE_KEY: str = ""
    SUPABASE_SECRET_KEY: str = ""

    # --- DB ---
    DATABASE_URL: str

    # --- 환율 ---
    USD_KRW_RATE: float = 1400.0

    # --- 기본 정책값 ---
    DEFAULT_MONTHLY_LIMIT_KRW: int = 15000
    DEFAULT_QUALITY: str = "medium"
    DEFAULT_DPI: int = 300

    @property
    def jwks_url(self) -> str:
        return f"{self.SUPABASE_URL}/auth/v1/.well-known/jwks.json"

    @property
    def auth_url(self) -> str:
        return f"{self.SUPABASE_URL}/auth/v1"

    @property
    def storage_url(self) -> str:
        return f"{self.SUPABASE_URL}/storage/v1"


settings = Settings()  # type: ignore[call-arg]


# =========================================================
# 이미지 생성 단가 (gpt-image-2 · 2026-07 기준, OpenAI 공지)
#   이미지 출력 $30 / 1M tokens
#   이미지 입력 $8  / 1M tokens (참고 이미지 — 항상 high fidelity 과금)
#   텍스트 입력 $5  / 1M tokens (프롬프트)
# 변경 시 여기만 수정.
# =========================================================
PRICE_IMAGE_OUTPUT_PER_MTOK = 30.0
PRICE_IMAGE_INPUT_PER_MTOK = 8.0
PRICE_TEXT_INPUT_PER_MTOK = 5.0

# 기본 모델
IMAGE_MODEL = "gpt-image-2"
IMAGE_MODEL_CHEAP = "gpt-image-1-mini"
TEXT_MODEL = "gpt-4.1-mini"  # 카피라이팅용

# 사전 예상비용 앵커 (1024×1024, USD) — "앞으로 N장" 미리보기 계산용.
# 실제 청구는 응답 usage 토큰으로 재계산한다. (계획서 §2 참고값)
ESTIMATE_USD_1024 = {"low": 0.006, "medium": 0.05, "high": 0.21}

# 사이즈 제약
SIZE_SNAP = 16          # 요청 px을 16의 배수로 스냅
SIZE_MAX = 3840         # 최대 생성 px (초과분은 업스케일)

# 전단지/배너 사이즈 프리셋 (계획서 §8 확정)
SIZE_PRESETS = {
    "flyer_a4_300": {"label": "전단지 A4 (300DPI)", "w": 2480, "h": 3508},
    "flyer_sample": {"label": "전단지 샘플 크기", "w": 1773, "h": 3189},
    "banner_basic": {"label": "배너 (가로형)", "w": 1024, "h": 400},
}
