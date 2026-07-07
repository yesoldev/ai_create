# Design Review: Studio.tsx · Home.tsx (Phase 2 생성 화면)

**Target:** frontend/src/pages/Studio.tsx, Home.tsx
**Focus:** Comprehensive (visual · usability · accessibility)
**Platform:** 반응형 · light/dark · 대상 60대 초보
**근거:** 코드 + 캡처(home.png, studio-1/2/result.png)

## Summary
마법사 흐름(①종류 ②크기·품질 ③문구 ④만들기→결과)이 명확하고, 큰 카드·큰 버튼·단계 표시·실시간 예상비용/"앞으로 N장"·PNG/JPG 다운로드까지 요구사항 충족. 이모지 0(Iconify), 쉬운 한글. 크리티컬/메이저 없음. 노년 UX 보강 2건 반영.

**Issues Found:** 3 — Minor 2 · Suggestion 1 (Minor 2건 즉시 반영)

## Minor Issues (반영 완료)

### Issue 1: 마법사 도중 이탈 시 입력 손실 · 확인 없음 → 반영
"그만두기"/"처음으로" 클릭 시 입력이 사라지는데 확인 없음. 노년 사용자의 오클릭 위험.
→ `guardedExit()`: 입력이 있으면 "지금 나가면 입력한 내용이 사라져요. 나갈까요?" 확인.

### Issue 2: 다운로드 실패 시 사용자 피드백 없음 → 반영
`downloadImage` 실패(네트워크 등) 시 아무 반응 없음.
→ `handleDownload`: try/catch로 "내려받기에 실패했어요..." 안내.

## Suggestion
- 3단계 "다음"이 설명 미입력 시 비활성(opacity)인데 이유 안내가 없음. 추후 "설명을 적어야 다음으로 갈 수 있어요" 헬퍼 고려(현재는 비활성만으로도 수용).

## Positive Observations
- 한 화면 한 결정(마법사), 상단 단계 표시로 위치 파악 쉬움
- 큰 선택 카드(아이콘+제목+설명), 56px 버튼, aria-pressed
- 품질/크기 변경 시 실시간 예상비용 + "앞으로 N장"(무제한이면 "제한 없이")
- 결과: 비용 안내 + PNG/JPG 다운로드(설명 병기) + 재생성/처음으로
- 실제 Supabase 서명 URL CORS(`*`) 확인 → 브라우저 다운로드/캔버스 변환 정상
- Home: 큰 만들기 버튼 + 남은 금액(진행바) + 최근 작업 썸네일

## 검증
- Playwright E2E: 로그인 3 + 스튜디오 마법사 1 = 4/4 통과
- 실생성 스모크 1건(저품질) 성공: OpenAI→Storage(PNG/썸네일)→DB→비용(usage 토큰)
