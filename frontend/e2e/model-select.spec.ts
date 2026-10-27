// 관리자 전용 AI 모델 선택 E2E. 백엔드 없이 돈다(모든 /api 응답 모킹).
// 실행: PW_NO_BACKEND=1 npx playwright test e2e/model-select.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { FAKE_PNG, OK, login, expectJobDone } from "./helpers";

/** /api/generate 요청 본문을 모아 두고 성공 응답을 준다. */
async function captureGenerate(page: Page) {
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/generate", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill(
      OK({
        generation_id: "g1", project_id: "p1", project_name: "봄맞이", page_id: "pg1",
        image_url: FAKE_PNG, thumb_url: FAKE_PNG, size: "500x200", cost_krw: 15, remaining_krw: null,
      }),
    );
  });
  return bodies;
}

/** 마법사를 '크기·품질' 단계까지 진행 */
async function toQualityStep(page: Page) {
  await page.getByRole("button", { name: /새 홍보물 만들기/ }).click();
  await page.getByRole("button", { name: /배너/ }).first().click();
  await page.getByRole("button", { name: "음식점" }).click();
  await expect(page.getByRole("heading", { name: "크기와 품질을 골라요" })).toBeVisible();
}

async function finishAndGenerate(page: Page) {
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("만들고 싶은 그림 설명").fill("봄맞이 할인 배너");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("heading", { name: "이대로 만들까요?" })).toBeVisible();
}

test("관리자는 AI 모델을 고를 수 있고, 고른 모델로 생성 요청이 간다", async ({ page }) => {
  await login(page, "admin");
  const bodies = await captureGenerate(page);
  await toQualityStep(page);

  await expect(page.getByText("관리자만 보여요")).toBeVisible();
  // 기본값은 기본 모델
  await expect(page.getByRole("button", { name: /기본 모델/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /2\.5 빠른형/ }).click();
  await expect(page.getByRole("button", { name: /2\.5 빠른형/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByText("관리자만 보여요").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "../.ui-design/shots/model-select-admin.png", fullPage: true });

  await finishAndGenerate(page);
  await expect(page.getByText("2.5 빠른형")).toBeVisible(); // 요약에 표시
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expectJobDone(page);
  expect(bodies[0]?.model).toBe("gpt-image-2.5-flare");
});

test("관리자가 기본 모델을 그대로 두면 model을 보내지 않는다", async ({ page }) => {
  await login(page, "admin");
  const bodies = await captureGenerate(page);
  await toQualityStep(page);
  await finishAndGenerate(page);
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expectJobDone(page);
  expect(bodies[0]?.model).toBeUndefined();
});

test("일반 사용자에겐 모델 선택이 보이지 않고 model을 보내지 않는다", async ({ page }) => {
  await login(page, "user");
  const bodies = await captureGenerate(page);
  await toQualityStep(page);
  await expect(page.getByText("관리자만 보여요")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /2\.5 빠른형/ })).toHaveCount(0);
  await finishAndGenerate(page);
  await expect(page.getByText("AI 모델")).toHaveCount(0);
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expectJobDone(page);
  expect(bodies[0]?.model).toBeUndefined();
});
