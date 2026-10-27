"""생성 크기 계획 — gpt-image-2의 최소/최대 픽셀 제약을 처리.

gpt-image-2는 너무 작은 해상도(최소 픽셀 예산 미만)를 거부한다.
따라서 요청 크기가 작으면 비율을 유지한 채 최소 이상으로 '생성'하고,
결과를 요청 크기로 '축소'해 전달한다. (요청이 상한 초과면 상한으로 생성.)
또 가로세로 비율은 3:1까지만 허용하므로, 더 길쭉한 요청(예: 800x200 띠배너)은
3:1로 생성한 뒤 가운데를 잘라 요청 비율로 맞춘다.
"""
from __future__ import annotations

from config import SIZE_MAX, SIZE_SNAP

# 모델이 허용하는 최소 생성 면적(px^2). 1024x1024가 정상 동작 확인됨(2026-07-07).
MIN_GEN_AREA = 1_048_576  # 1024*1024
# 모델이 허용하는 최대 가로세로 비율. 초과 시 400 "maximum supported aspect ratio is 3:1"(2026-10-27 확인).
MAX_GEN_RATIO = 3.0


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

    # 생성 크기: 비율 유지(단, 3:1을 넘으면 3:1로 — 나머지는 가운데 자르기로 맞춘다)
    gw, gh = float(fw), float(fh)
    if gw > gh * MAX_GEN_RATIO:
        gh = gw / MAX_GEN_RATIO
    elif gh > gw * MAX_GEN_RATIO:
        gw = gh / MAX_GEN_RATIO
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
    sw, sh = snap16(gw), snap16(gh)
    # 16배수 반올림으로 3:1을 살짝 넘는 경우 짧은 변을 한 칸 늘린다
    while sw > sh * MAX_GEN_RATIO:
        sh += SIZE_SNAP
    while sh > sw * MAX_GEN_RATIO:
        sw += SIZE_SNAP
    return sw, sh, fw, fh


def crop_edge_ratio(gen_w: int, gen_h: int, fin_w: int, fin_h: int) -> tuple[str, float]:
    """생성 결과를 요청 비율로 맞출 때 잘려나가는 방향과 한쪽 가장자리 비율.

    반환: ("vertical"=위아래 잘림 | "horizontal"=좌우 잘림 | "", 한쪽당 잘리는 비율 0~0.5)
    """
    g, f = gen_w / gen_h, fin_w / fin_h
    if abs(g - f) / f < 0.02:  # 2% 미만 차이는 리사이즈로 흡수
        return "", 0.0
    if f > g:  # 요청이 더 납작 → 위아래를 자른다
        return "vertical", (1 - g / f) / 2
    return "horizontal", (1 - f / g) / 2
