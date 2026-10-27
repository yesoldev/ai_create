"""관리자 조언용 — 저장된 생성 기록을 '직원이 입력한 내용' 목록으로 보여준다.

새 기록은 generations.user_input(직원 입력 원문)을 그대로 쓰고,
user_input이 없는 예전 기록은 AI에 보낸 가공 문장(prompt)에서 입력 부분을 뽑아낸다.
(가공 형식: 스튜디오 `[업종: X] 설명. 색감 힌트 + 고정 지시문 + 변주` / 편집기 `... 아래 요청만 반영해: "..."`,
 끝에 백엔드 글자 규칙 `넣을 문구:\n"..."`)
"""
from __future__ import annotations

import re

# 설명 뒤에 붙는 고정 문구들의 시작 — 이 앞까지가 직원이 쓴 설명
_DESC_END_MARKERS = (
    " 전체적인 색감과 분위기를 ",
    " 인쇄용 홍보 광고 이미지.",
    " 세로로 긴 인쇄용 전단지",
    "\n\n[글자 규칙",
)
_SIMILARITY_PREFIXES = (
    "아래 참고 이미지의 느낌만 살짝 참고해 새롭게 만들어줘.",
    "아래 참고 이미지와 비슷한 분위기로 다시 만들어줘.",
    "아래 참고 이미지의 구도와 색감을 비슷하게 유지하며 다시 만들어줘.",
    "아래 참고 이미지를 거의 그대로 유지하되 아주 조금만 다르게 만들어줘.",
)


def _item(label: str, value: str | None) -> dict | None:
    v = (value or "").strip()
    return {"label": label, "value": v} if v else None


def legacy_inputs(prompt: str | None) -> list[dict]:
    """예전 기록의 가공 문장에서 직원 입력 항목을 최대한 복원한다."""
    p = (prompt or "").strip()
    if not p:
        return []
    out: list[dict | None] = []

    text = None
    m = re.search(r'넣을 문구:\n"(.*)"\s*$', p, re.S)
    if m:
        text = m.group(1)

    # 참고 이미지 문구는 백엔드가 맨 앞에 붙인다 — 먼저 떼어낸다
    has_ref = False
    for pre in _SIMILARITY_PREFIXES:
        if p.startswith(pre):
            has_ref = True
            p = p[len(pre):].lstrip()
            break

    # 편집기 'AI로 수정' 요청 (요청 안에 따옴표가 있을 수 있어 뒤쪽 고정 문구까지 통째로 잡는다)
    #  편집기 문장은 버전마다 조금씩 달랐지만 이 안내 문구는 늘 들어 있다
    if "요청은 그림에 그대로 적는 글자가 아니라" in p or p.startswith("이 참고 이미지를 바탕으로 다시 만들어줘."):
        m = re.search(r'아래 요청만 반영해: "(.*)"\. 요청은 그림에', p, re.S) or re.search(  # 현재 형식
            r'요청: "(.*)"\. (?:화살표|요청에 없는)', p, re.S  # 예전 형식들
        )
        out.append(_item("AI 수정 요청", m.group(1) if m else None))
        m = re.search(r"이미지 크기를 (\d+x\d+) 픽셀로 바꾸되", p)
        out.append(_item("크기 변경", m.group(1) if m else None))
        return [i for i in out if i]

    if has_ref:
        out.append(_item("참고 이미지", "참고 이미지와 비슷하게"))

    m = re.match(r"\[업종: ([^\]]+)\]\s*", p)
    if m:
        out.append(_item("업종", m.group(1)))
        p = p[m.end():]

    cut = min((i for i in (p.find(k) for k in _DESC_END_MARKERS) if i >= 0), default=len(p))
    out.append(_item("설명", p[:cut].strip().rstrip(".")))

    m = re.search(r"전체적인 색감과 분위기를 (\S+) 계열로", p)
    out.append(_item("색감", m.group(1) if m else None))
    out.append(_item("넣을 글자", text))
    return [i for i in out if i]


def inputs_of(row: dict) -> list[dict]:
    ui = row.get("user_input")
    if isinstance(ui, list) and ui:
        return [i for i in ui if isinstance(i, dict) and i.get("value")]
    return legacy_inputs(row.get("prompt"))
