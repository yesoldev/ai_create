import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "yesol.dev@gmail.com";
const ADMIN_PW = "yesol1234";

// 1x1 투명 PNG data URI (모킹 이미지)
const FAKE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호", { exact: true }).fill(ADMIN_PW);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL("http://localhost:5173/", { timeout: 15_000 });
}

test("스튜디오 마법사로 배너를 만든다 (생성 모킹)", async ({ page }) => {
  await login(page);

  // 생성 요청만 모킹 (돈 안 씀)
  await page.route("**/api/generate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        generation_id: "test-id",
        image_url: FAKE_PNG,
        thumb_url: FAKE_PNG,
        size: "1024x400",
        cost_krw: 12,
        remaining_krw: null,
      }),
    });
  });

  // 홈 → 스튜디오
  await page.getByRole("button", { name: /새 홍보물 만들기/ }).click();
  await expect(page).toHaveURL(/\/studio$/);

  // 1단계: 배너 선택 → 자동 2단계
  await page.getByRole("button", { name: /배너/ }).first().click();
  await expect(page.getByRole("heading", { name: "크기와 품질을 골라요" })).toBeVisible();

  // 예상비용 바(실제 estimate 호출) 노출 확인
  await expect(page.getByText(/한 장에 약/)).toBeVisible({ timeout: 10_000 });

  // 품질 보통 선택 후 다음
  await page.getByRole("button", { name: /보통 \(추천\)/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();

  // 3단계: 설명 입력
  await expect(page.getByRole("heading", { name: "어떤 그림을 원하세요?" })).toBeVisible();
  await page.getByLabel("만들고 싶은 그림 설명").fill("봄맞이 할인 배너, 밝은 분홍 배경");
  await page.getByLabel(/그림에 넣을 글자/).fill("봄맞이 30% 할인");
  await page.getByRole("button", { name: "다음", exact: true }).click();

  // 4단계: 요약 확인 후 만들기
  await expect(page.getByRole("heading", { name: "이대로 만들까요?" })).toBeVisible();
  await page.getByRole("button", { name: "만들기", exact: true }).click();

  // 결과 화면
  await expect(page.getByRole("heading", { name: /완성됐어요/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /PNG로 내려받기/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /JPG로 내려받기/ })).toBeVisible();
});
