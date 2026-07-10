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
  await page.getByRole("button", { name: /글자 수정 또는 추가/ }).click();
  await expect(page).toHaveURL(/\/editor$/);

  // 보관함에 저장
  await page.getByRole("button", { name: /보관함에 저장/ }).click();
  await page.getByPlaceholder("예) 봄맞이 할인 배너").fill("봄맞이 배너");
  const saveReq = page.waitForRequest((r) => r.url().endsWith("/api/templates") && r.method() === "POST");
  await page.getByRole("button", { name: /^저장/ }).click();
  await saveReq;
  await expect(page.getByText("보관함에 저장했어요.")).toBeVisible();

  // 보관함으로 이동 → 폴더 트리 + 항목 확인
  await page.goto("/library");
  await expect(page.getByRole("button", { name: /OO식당/ })).toBeVisible();
  await expect(page.getByText("봄맞이 배너")).toBeVisible();

  // 새 폴더 — 예쁜 입력 모달(window.prompt 아님)
  await page.route("**/api/folders", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "f2", parent_id: null, name: "미래부동산", sort_order: 1 }) })
      : route.continue(),
  );
  await page.getByRole("button", { name: /새 폴더/ }).click();
  await expect(page.getByRole("heading", { name: "새 폴더 만들기" })).toBeVisible();
  const createReq = page.waitForRequest((r) => r.url().endsWith("/api/folders") && r.method() === "POST");
  await page.getByPlaceholder("예) 행복식당").fill("미래부동산");
  await page.getByRole("button", { name: /^만들기/ }).click();
  await createReq;

  // 항목 다시 열기
  await page.getByText("봄맞이 배너").click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("button", { name: "글자 넣기" })).toBeVisible();
});

test("보관함: 새 프로젝트 모달에서 이미지 올리기로 프로젝트를 만든다", async ({ page }) => {
  await page.route("**/api/templates", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) }),
  );
  await page.route("**/api/folders/tree", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) }),
  );
  let uploaded = false;
  await page.route("**/api/templates/upload", (r) => {
    uploaded = true;
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ project_id: "up1", page_id: "pg1", name: "올린 홍보물", size_w: 500, size_h: 200, image_url: FAKE_PNG, thumb_url: FAKE_PNG }),
    });
  });

  await login(page);
  await page.goto("/library");
  await page.getByRole("button", { name: /새 프로젝트/ }).click();
  await expect(page.getByRole("heading", { name: "새 프로젝트 만들기" })).toBeVisible();
  // 두 선택지(AI로 만들기 / 이미지 올리기)
  await expect(page.getByRole("button", { name: /AI로 만들기/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /이미지 올리기/ })).toBeVisible();
  // 파일 선택 → 업로드 → 편집기로 이동
  await page.setInputFiles('input[type="file"]', {
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(FAKE_PNG.split(",")[1], "base64"),
  });
  await expect(page).toHaveURL(/\/editor$/, { timeout: 10_000 });
  expect(uploaded).toBe(true);
});
