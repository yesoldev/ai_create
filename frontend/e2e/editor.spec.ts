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
      body: JSON.stringify({ generation_id: "t", project_id: "t", image_url: FAKE_PNG, thumb_url: FAKE_PNG, size: "1024x400", cost_krw: 12, remaining_krw: null }),
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
  await page.getByRole("button", { name: /글자 수정 또는 추가/ }).click();
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

test("편집기: AI로 글자 수정하면 template_id로 프로젝트를 갱신한다", async ({ page }) => {
  await login(page);
  let sent: Record<string, unknown> = {};
  await page.route("**/api/generate", (route) => {
    sent = route.request().postDataJSON();
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generation_id: "g2", project_id: "t", project_name: "제목", image_url: FAKE_PNG, thumb_url: FAKE_PNG, size: "1024x400", cost_krw: 10, remaining_krw: null }) });
  });

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

  // AI로 글자 수정 → 기존 프로젝트(template_id) 갱신 요청
  await page.getByRole("button", { name: /AI로 글자 수정/ }).click();
  await expect(page.getByRole("heading", { name: "AI로 글자 수정 또는 추가" })).toBeVisible();
  await page.getByPlaceholder(/봄맞이 30% 할인/).fill("여름 세일 시작");
  const aiReq = page.waitForRequest(
    (r) => r.url().endsWith("/api/generate") && r.method() === "POST" && r.postDataJSON()?.template_id === "t",
  );
  await page.getByRole("button", { name: /AI로 수정하기/ }).click();
  await aiReq;
  await expect(page.getByText(/AI가 글자를 수정했어요/)).toBeVisible({ timeout: 10_000 });
  expect(String(sent.text_content)).toContain("여름 세일 시작");
});

test("편집기: 변경 후 나가면 저장 확인 모달이 뜬다", async ({ page }) => {
  await login(page);
  await page.route("**/api/templates/*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await reachResult(page);
  await page.getByRole("button", { name: /글자 수정 또는 추가/ }).click();
  await page.getByRole("button", { name: "글자 넣기" }).click(); // 변경 발생

  // 뒤로 → 저장 확인 모달
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(page.getByRole("heading", { name: "저장하시겠습니까?" })).toBeVisible();
  // 취소 → 계속 편집(모달 닫힘, 편집기 유지)
  await page.getByRole("button", { name: /취소 \(계속 편집\)/ }).click();
  await expect(page.getByRole("heading", { name: "저장하시겠습니까?" })).toBeHidden();
  await expect(page).toHaveURL(/\/editor$/);
  // 다시 뒤로 → 저장 안 하고 나가기 → 편집기 벗어남
  await page.getByRole("button", { name: "뒤로" }).click();
  await page.getByRole("button", { name: /저장 안 하고 나가기/ }).click();
  await expect(page).not.toHaveURL(/\/editor$/);
});
