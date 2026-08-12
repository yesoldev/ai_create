// 안전 검사(모더레이션) 오탐 → 자동 재시도 + 한글 오류 안내 E2E.
// 백엔드 없이 돌린다(모든 /api 응답 모킹). 실행: PW_NO_BACKEND=1 npx playwright test e2e/safety-retry.spec.ts
import { test, expect, type Page } from "@playwright/test";

const FAKE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const OK = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

/** 로그인·홈·스튜디오가 부르는 API를 전부 모킹(백엔드 불필요). */
async function mockBackend(page: Page) {
  await page.route("**/api/**", (r) => r.fulfill(OK({ items: [] })));
  await page.route("**/api/auth/login", (r) =>
    r.fulfill(OK({ access_token: "t", refresh_token: "r" })),
  );
  await page.route("**/api/auth/me", (r) =>
    r.fulfill(
      OK({ id: "u1", email: "test@test.com", name: "테스트", role: "user", monthly_limit_krw: null }),
    ),
  );
  await page.route("**/api/usage/me", (r) => r.fulfill(OK({ remaining_krw: null })));
  await page.route("**/api/usage/estimate**", (r) =>
    r.fulfill(
      OK({ quality: "medium", estimated_cost_krw: 70, remaining_krw: null, remaining_images: null }),
    ),
  );
  await page.route("**/api/settings/default-sizes", (r) =>
    r.fulfill(OK({ banner: { w: 500, h: 200 }, flyer: { w: 1773, h: 3189 } })),
  );
}

async function login(page: Page) {
  await mockBackend(page);
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill("test@test.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("pw");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL("http://localhost:5173/", { timeout: 15_000 });
}

/** 스튜디오 마법사를 '만들기' 직전까지 진행. */
async function fillWizard(page: Page) {
  await page.getByRole("button", { name: /새 홍보물 만들기/ }).click();
  await page.getByRole("button", { name: /배너/ }).first().click();
  await page.getByRole("button", { name: "음식점" }).click();
  await page.getByRole("button", { name: /보통 \(추천\)/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("만들고 싶은 그림 설명").fill("봄맞이 할인 배너");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("heading", { name: "이대로 만들까요?" })).toBeVisible();
}

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
    // 2차(안전 조건 추가): 성공
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
