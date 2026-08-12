// 안전 검사(모더레이션) 오탐 → 자동 재시도 + 한글 오류 안내 E2E.
// 백엔드 없이 돌린다(모든 /api 응답 모킹). 실행: PW_NO_BACKEND=1 npx playwright test e2e/safety-retry.spec.ts
import { test, expect } from "@playwright/test";
import { FAKE_PNG, OK, login, fillWizard } from "./helpers";

test("안전 검사에 걸리면 안내를 띄우고 자동으로 다시 만든다", async ({ page }) => {
  await login(page);

  const levels: number[] = [];
  await page.route("**/api/generate", async (route) => {
    const level = Number(route.request().postDataJSON()?.safety_level ?? -1);
    levels.push(level);
    if (level === 0) {
      // 1차: 출력 안전 검사 오탐으로 차단
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ detail: { code: "moderation", message: "OpenAI 안전 검사에 걸렸어요." } }),
      });
      return;
    }
    // 2차(안전 조건 추가): 성공 — 재시도 안내를 볼 수 있게 조금 늦게 응답
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill(
      OK({
        generation_id: "g1",
        project_id: "p1",
        project_name: "봄맞이",
        page_id: "pg1",
        image_url: FAKE_PNG,
        thumb_url: FAKE_PNG,
        size: "500x200",
        cost_krw: 70,
        remaining_krw: null,
      }),
    );
  });

  await fillWizard(page);
  await page.getByRole("button", { name: "만들기", exact: true }).click();

  // 재시도 안내가 화면에 보인다
  await expect(page.getByText(/안전 검사에 걸려서 다시 만들고 있어요 \(2번째 시도 \/ 최대 3번\)/)).toBeVisible({
    timeout: 10_000,
  });
  // 재시도가 성공하면 결과 화면
  await expect(page.getByRole("heading", { name: /완성됐어요/ })).toBeVisible({ timeout: 10_000 });
  expect(levels).toEqual([0, 1]); // 안전 단계를 올려 가며 재시도
});

test("3번 모두 안전 검사에 막히면 한글 안내를 보여준다(영어 원문 노출 없음)", async ({ page }) => {
  await login(page);

  const levels: number[] = [];
  await page.route("**/api/generate", async (route) => {
    levels.push(Number(route.request().postDataJSON()?.safety_level ?? -1));
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ detail: { code: "moderation", message: "OpenAI 안전 검사에 걸렸어요." } }),
    });
  });

  await fillWizard(page);
  await page.getByRole("button", { name: "만들기", exact: true }).click();

  await expect(page.getByText(/여러 번 다시 시도했지만 OpenAI 안전 검사를 통과하지 못했어요/)).toBeVisible({
    timeout: 20_000,
  });
  expect(levels).toEqual([0, 1, 2]);
  await expect(page.getByText(/safety|moderation_blocked|Error code/i)).toHaveCount(0);
});

test("서버·네트워크 오류도 영어 대신 한글 안내가 뜬다", async ({ page }) => {
  await login(page);
  await page.route("**/api/generate", (r) =>
    r.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        detail: { code: "rate_limit", message: "지금 AI 서버에 요청이 많이 몰려 있어요. 1~2분 뒤에 다시 시도해 주세요." },
      }),
    }),
  );

  await fillWizard(page);
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(page.getByText(/지금 AI 서버에 요청이 많이 몰려 있어요/)).toBeVisible({ timeout: 10_000 });
});
