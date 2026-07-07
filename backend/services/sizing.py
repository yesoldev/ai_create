"""생성 크기 계획 — gpt-image-2의 최소/최대 픽셀 제약을 처리.

gpt-image-2는 너무 작은 해상도(최소 픽셀 예산 미만)를 거부한다.
따라서 요청 크기가 작으면 비율을 유지한 채 최소 이상으로 '생성'하고,
결과를 요청 크기로 '축소'해 전달한다. (요청이 상한 초과면 상한으로 생성.)
"""
from __future__ import annotations

from config import SIZE_MAX, SIZE_SNAP

# 모델이 허용하는 최소 생성 면적(px^2). 1024x1024가 정상 동작 확인됨(2026-07-07).
MIN_GEN_AREA = 1_048_576  # 1024*1024


def snap16(v: float) -> int:
    return max(SIZE_SNAP, round(v / SIZE_SNAP) * SIZE_SNAP)


def plan_size(req_w: int, req_h: int) -> tuple[int, int, int, int]:
    """반환: (gen_w, gen_h, final_w, final_h)

    - gen_*: 실제로 gpt-image-2에 보낼 크기(16배수, 최소면적 충족, 상한 이내)
    - final_*: 사용자에게 전달할 최종 크기(요청값, 상한만 적용) — gen과 다르면 리사이즈
    """
    rw = max(1, int(req_w))
    rh = max(1, int(req_h))
    # 최종 전달 크기: 요청값(상한만 적용)
    fw = min(rw, SIZE_MAX)
    fh = min(rh, SIZE_MAX)

    # 생성 크기: 비율 유지
    gw, gh = float(fw), float(fh)
    area = gw * gh
    if area < MIN_GEN_AREA:  # 너무 작으면 확대
        s = (MIN_GEN_AREA / area) ** 0.5
        gw *= s
        gh *= s
    m = max(gw, gh)
    if m > SIZE_MAX:  # 너무 크면 축소
        s = SIZE_MAX / m
        gw *= s
        gh *= s
    return snap16(gw), snap16(gh), fw, fh
