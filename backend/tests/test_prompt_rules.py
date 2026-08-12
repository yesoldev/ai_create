"""글자 규칙 프롬프트 조립 검증 (외부 호출 없음).

실행: backend 에서  .venv\\Scripts\\python.exe tests\\test_prompt_rules.py
"""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from routers.generate import apply_text_rules  # noqa: E402


def check(name: str, cond: bool) -> None:
    if not cond:
        raise AssertionError(f"FAIL: {name}")
    print(f"PASS {name}")


BASE = "봄맞이 할인 배너를 만들어줘."

# 1) 넣을 문구가 있으면 그 문구만 정확히 넣도록 못박는다
p = apply_text_rules(BASE, "ai_text", "행복식당\n봄맞이 30% 할인", has_ref=False)
check("문구 포함", "행복식당\n봄맞이 30% 할인" in p)
check("지어내기 금지", "지어내 넣지 마" in p)
check("맞춤법 유지", "한 글자도 바꾸지 말고" in p)
check("변주와 무관하게 글자 고정", "글자 내용은 절대 바꾸지 마" in p)
check("규칙은 맨 뒤", p.startswith(BASE))

# 2) 문구가 없고 참고 이미지가 있으면(편집기 AI 수정) 원래 글자를 지킨다
p = apply_text_rules(BASE, "ai_text", None, has_ref=True)
check("원래 글자 유지", "그대로 유지" in p)
check("요청 없는 글자 금지", "요청하지 않은 새 글자" in p)
check("글자 금지 규칙은 안 붙음", "그림 안에 글자를 넣지 마" not in p)

# 3) 문구도 참고 이미지도 없으면 글자를 아예 넣지 않는다
p = apply_text_rules(BASE, "ai_text", None, has_ref=False)
check("글자 넣지 말 것", "그림 안에 글자를 넣지 마" in p)

# 4) 빈 문자열은 '문구 없음'과 같게 취급
p = apply_text_rules(BASE, "ai_text", "", has_ref=False)
check("빈 문구 = 글자 없음", "그림 안에 글자를 넣지 마" in p)

# 5) layer 모드(사용자가 직접 글자를 얹는 모드)에는 규칙을 붙이지 않는다
check("layer 모드는 그대로", apply_text_rules(BASE, "layer", "행복식당", has_ref=False) == BASE)

print("ALL PASS")
