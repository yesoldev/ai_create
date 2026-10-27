// 관리자: 직원이 만든 그림과 입력 내용 보기(조언용) — 실제 백엔드·실제 기록으로 확인(조회만, 변경 없음)
import { test, expect } from "@playwright/test";

test("관리자는 직원이 만든 그림과 입력한 내용을 팝업으로 본다", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill("yesol.dev@gmail.com");
  await page.getByLabel("비밀번호", { exact: true }).fill(process.env.E2E_ADMIN_PW ?? "");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL("http://localhost:5173/", { timeout: 15_000 });
  await page.getByRole("button", { name: /관리자/ }).click();
  await expect(page.getByRole("heading", { name: "계정 관리" })).toBeVisible();
  // 실제 서버의 AI 모델 설정을 읽어 '사용 중'을 표시한다(조회만)
  const modelCard = page.locator("section", { has: page.getByRole("heading", { name: "AI 그림 모델" }) });
  await expect(modelCard.getByText("사용 중")).toHaveCount(1, { timeout: 15_000 });

  // 신미영님 행의 '만든 것 보기'
  const row = page.locator("div.rounded-2xl", { hasText: "tlsaldud7195@naver.com" }).first();
  await row.getByRole("button", { name: "만든 것 보기" }).click();
  const gallery = page.getByRole("dialog", { name: /신미영님이 만든 홍보물/ });
  await expect(gallery).toBeVisible();
  const cards = gallery.locator("ul > li");
  await expect(cards.first()).toBeVisible({ timeout: 15_000 });
  expect(await cards.count()).toBe(60); // 첫 페이지 60장
  await expect(gallery.getByRole("button", { name: "더 보기" })).toBeVisible();
  await page.screenshot({ path: "../.ui-design/shots/admin-works-gallery.png" });

  // 한 장 열기 → 직원 입력 + 설정 + 전체 문장
  await cards.first().getByRole("button").click();
  const detail = page.getByRole("dialog", { name: "홍보물 자세히 보기" });
  // 원본 그림 서명 주소를 Supabase에서 받아 오느라 늦을 때가 있다
  await expect(detail.getByRole("heading", { name: "직원이 입력한 내용" })).toBeVisible({ timeout: 15_000 });
  await expect(detail.locator("dl dt").first()).toBeVisible({ timeout: 15_000 });
  await expect(detail.getByText(/^품질 /)).toBeVisible();
  await expect(detail.locator("img")).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "../.ui-design/shots/admin-works-detail.png" });

  // 전체 문장 펼치기
  await detail.getByText("AI에 실제로 보낸 전체 문장").click();
  await expect(detail.locator("details p")).toBeVisible();

  // 다음 작품으로 넘기기 (오른쪽 화살표 키)
  const firstTitle = await detail.locator("h3").textContent();
  await expect(detail.getByText("1 / 60+")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: "홍보물 자세히 보기" }).getByText("2 / 60+")).toBeVisible();
  expect(firstTitle).toBeTruthy();

  // Esc: 자세히 보기만 닫히고 모아보기는 남는다 → 한 번 더 Esc로 모아보기도 닫힘
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "홍보물 자세히 보기" })).toHaveCount(0);
  await expect(gallery).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(gallery).toHaveCount(0);
});

test("일반 사용자는 관리자 조회 API를 쓸 수 없다", async ({ request }) => {
  const r = await request.get("http://localhost:8000/api/admin/generations/00000000-0000-0000-0000-000000000000");
  expect([401, 403]).toContain(r.status()); // 토큰 없음 → 거부
});
