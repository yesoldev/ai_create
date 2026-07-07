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

test("보관함: 편집기에서 저장하고 다시 열기", async ({ page }) => {
  await page.route("**/api/generate", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generation_id: "gen1", image_url: FAKE_PNG, thumb_url: FAKE_PNG, size: "500x200", cost_krw: 8, remaining_krw: null }) }),
  );
  // 템플릿 저장/목록/상세 모킹
  await page.route("**/api/templates", (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "tpl1" }) });
    } else {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [{ id: "tpl1", name: "봄맞이 배너", size_w: 500, size_h: 200, thumb_url: FAKE_PNG, updated_at: "2026-07-07" }] }),
      });
    }
  });
  await page.route("**/api/folders/tree", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: "f1", parent_id: null, name: "OO식당", sort_order: 0 }] }) }),
  );
  await page.route("**/api/templates/tpl1", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "tpl1", name: "봄맞이 배너", canvas_json: { version: "6", objects: [] }, size_w: 500, size_h: 200, bg_url: FAKE_PNG, thumb_url: FAKE_PNG }),
    }),
  );

  await login(page);

  // 스튜디오 → 결과 → 편집기
  await page.getByRole("button", { name: /새 홍보물 만들기/ }).click();
  await page.getByRole("button", { name: /배너/ }).first().click();
  await page.getByRole("button", { name: "음식점" }).click();
  await page.getByRole("button", { name: /보통 \(추천\)/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("만들고 싶은 그림 설명").fill("테스트");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await page.getByRole("button", { name: /글자 넣고 꾸미기/ }).click();
  await expect(page).toHaveURL(/\/editor$/);

  // 보관함에 저장
  await page.getByRole("button", { name: /보관함에 저장/ }).click();
  await page.getByPlaceholder("예) 봄맞이 할인 배너").fill("봄맞이 배너");
  const saveReq = page.waitForRequest((r) => r.url().endsWith("/api/templates") && r.method() === "POST");
  await page.getByRole("button", { name: /^저장/ }).click();
  await saveReq;
  await expect(page.getByText("보관함에 저장했어요.")).toBeVisible();

  // 보관함으로 이동 → 폴더 트리 + 항목 확인 → 다시 열기
  await page.goto("/library");
  await expect(page.getByRole("button", { name: /OO식당/ })).toBeVisible();
  await expect(page.getByText("봄맞이 배너")).toBeVisible();
  await page.getByText("봄맞이 배너").click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("button", { name: "글자 넣기" })).toBeVisible();
});
