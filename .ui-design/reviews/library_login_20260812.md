# Design Review: 보관함 제목 검색 · 로그인 아이디 저장

**Target:** frontend/src/pages/Library.tsx(검색), frontend/src/pages/Login.tsx(아이디 저장)
**Platform:** 반응형 light/dark · **사용자:** 60대 초보
**근거:** 코드 + 스크린샷 4종(shots/library_search·library_search_empty·login_save_id·login_save_id_mobile.png) + E2E 2건(library-search.spec.ts)

## Summary
보관함이 쌓이면 스크롤로 찾기 어려워 제목 검색을 넣고, 매번 이메일을 치는 부담을 덜려고
아이디 저장을 기본 켜짐으로 넣었다. 메이저 1건은 리뷰 중 수정 완료.

**Issues:** Critical 0 · Major 1(수정완료) · Minor 0 · Suggestion 2(미적용)

## Major — 수정 완료

### 1. 검색창에 X 버튼이 두 개 겹쳐 보임
- **문제:** `type="search"` 는 크롬이 자체 지우기(X)를 그린다. 우리가 만든 큰 X와 나란히 붙어
  두 개가 보였다(스크린샷 확인). 나이든 사용자에겐 "어느 걸 눌러야 하나" 혼란.
- **조치:** `type="text" inputMode="search"` 로 바꿔 브라우저 기본 X를 없애고 우리 X만 남겼다.

## 검토했고 문제 없던 것
- 검색창 높이 56px(h-14)·글씨 18px — 앱의 큰 입력칸 기준과 동일.
- 결과 수를 "2개 찾았어요 (전체 3개 중)"로 한글 문장으로 안내(`aria-live="polite"`).
- 결과가 없을 때 빈 화면 대신 안내 + [검색어 지우고 전체 보기] 버튼으로 빠져나갈 길 제공.
- 아이디 저장 체크박스 24px(h-6 w-6), 라벨 전체가 클릭 영역. 기본 체크 상태가 화면에서 명확.
- "(비밀번호는 저장하지 않아요)" 보조 문구로 오해 방지. 실제로 이메일만 localStorage 저장.
- 로그인 **성공한 아이디만** 저장 → 오타가 남아 다음 로그인을 방해하지 않음.
- 모바일(390px)에서 체크박스·라벨이 한 줄에 들어가고 버튼과 간격 유지.

## Suggestion — 미적용
1. 검색을 폴더 전체(서버 검색)로 확장 — 지금은 보고 있는 폴더의 목록(최대 100개)에서만 찾는다.
2. 최근 검색어 기억 — 현재는 화면을 나가면 검색어가 사라진다.

---
_E2E: frontend/e2e/library-search.spec.ts 2건 통과 (PW_NO_BACKEND=1)._
