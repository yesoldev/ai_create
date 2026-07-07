import { test, expect, type Page } from "@playwright/test";

const FAKE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill("yesol.dev@gmail.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("yesol1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL("http://localhost:5173/", { timeout: 15_000 });
}

async function reachResult(page: Page) {
  await page.route("**/api/generate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ generation_id: "t", image_url: FAKE_PNG, thumb_url: FAKE_PNG, size: "1024x400", cost_krw: 12, remaining_krw: null }),
    }),
  );
  await page.getByRole("button", { name: /새 홍보물 만들기/ }).click();
  await page.getByRole("button", { name: /배너/ }).first().click();
  await page.getByRole("button", { name: "음식점" }).click();
  await page.getByRole("button", { name: /보통 \(추천\)/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("만들고 싶은 그림 설명").fill("테스트");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(page.getByRole("heading", { name: /완성됐어요/ })).toBeVisible({ timeout: 10_000 });
}

test("편집기: 결과에서 열어 글자 추가·되돌리기·저장", async ({ page }) => {
  await login(page);
  await reachResult(page);

  // 결과 → 편집기
  await page.getByRole("button", { name: /글자 넣고 꾸미기/ }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("button", { name: "글자 넣기" })).toBeVisible();

  // 삭제/되돌리기는 처음엔 비활성
  await expect(page.getByRole("button", { name: "삭제" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "되돌리기" })).toBeDisabled();

  // 글자 추가 → 선택 생기고 되돌리기 가능
  await page.getByRole("button", { name: "글자 넣기" }).click();
  await expect(page.getByRole("button", { name: "삭제" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "되돌리기" })).toBeEnabled();

  // 되돌리기 → 다시 비활성(초기 상태)
  await page.getByRole("button", { name: "되돌리기" }).click();
  await expect(page.getByRole("button", { name: "되돌리기" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "다시" })).toBeEnabled();

  // PNG 저장 → 다운로드 발생
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG", exact: true }).click();
  const d = await dl;
  expect(d.suggestedFilename()).toMatch(/홍보물_\d{8}\.png/);
});
