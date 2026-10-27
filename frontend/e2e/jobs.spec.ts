// 백그라운드 AI 작업 E2E — 상단 진행 알림·오른쪽 패널·확대 팝업·바로가기·편집기 작업 중 표시.
// 백엔드 없이 돈다(모든 /api 응답 모킹). 실행: PW_NO_BACKEND=1 npx playwright test e2e/jobs.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { OK, login, fillWizard, svgImage, expectJobDone } from "./helpers";

const SHOTS = "../.ui-design/shots";
const IMG = svgImage(1024, 400, "#10b981");
const IMG2 = svgImage(1024, 400, "#f59e0b");

/** /api/generate 를 delayMs 뒤에 성공시키는 모킹 */
async function slowGenerate(page: Page, delayMs: number, image = IMG, pageId = "pg1") {
  await page.route("**/api/generate", async (route) => {
    await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill(
      OK({
        generation_id: "g1",
        project_id: "p1",
        project_name: "봄맞이",
        page_id: pageId,
        image_url: image,
        thumb_url: image,
        size: "1024x400",
        cost_krw: 15,
        remaining_krw: null,
      }),
    );
  });
}

/** 바로가기 → 편집기에 넘길 프로젝트 상세 */
async function mockProject(page: Page) {
  await page.route("**/api/templates/p1", (route) =>
    route.request().method() === "GET"
      ? route.fulfill(
          OK({
            id: "p1",
            name: "봄맞이",
            canvas_json: null,
            size_w: 1024,
            size_h: 400,
            folder_id: null,
            bg_url: IMG,
            thumb_url: IMG,
            pages: [{ id: "pg1", sort_order: 0, bg_url: IMG, thumb_url: IMG, canvas_json: null }],
          }),
        )
      : route.fulfill(OK({ ok: true })),
  );
  await page.route("**/api/templates/p1/pages", (route) => route.fulfill(OK({ ok: true })));
}

test("만들기는 백그라운드로 돌고, 알림·패널·확대·바로가기가 동작한다", async ({ page }) => {
  await login(page);
  await slowGenerate(page, 3000);
  await mockProject(page);

  await fillWizard(page);
  await page.getByRole("button", { name: "만들기", exact: true }).click();

  // 기다리지 않고 바로 처음 단계로 — 안내 + 상단 진행 알림
  await expect(page.getByRole("heading", { name: "무엇을 만들까요?" })).toBeVisible();
  await expect(page.getByText(/만들기를 시작했어요/)).toBeVisible();
  const bar = page.getByRole("button", { name: /AI가 1개 만드는 중/ });
  await expect(bar).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/jobs-bar-running.png` });

  // 알림을 누르면 오른쪽 패널 — 만드는 중 카드(진행 막대)
  await bar.click();
  const panel = page.getByRole("dialog", { name: "AI 작업 목록" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/만드는 중 · \d+초/)).toBeVisible();
  await expect(panel.getByRole("progressbar")).toBeVisible();
  await page.waitForTimeout(700); // 패널 미끄러져 들어오는 애니메이션
  await page.screenshot({ path: `${SHOTS}/jobs-panel-running.png` });

  // 완성되면 그림 + 바로가기
  await expect(panel.getByRole("button", { name: "바로가기" })).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByAltText(/완성 그림/)).toBeVisible();
  await expect(page.getByText("1개 완성됐어요")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/jobs-panel-done.png` });

  // 그림에 마우스를 올리면 돋보기 → 누르면 가운데 팝업
  const zoomBtn = panel.getByRole("button", { name: "크게 보기" });
  await expect(zoomBtn).toHaveCSS("opacity", "0");
  await zoomBtn.hover(); // 그림 전체를 덮는 투명 버튼 — 그림 위에 마우스를 올린 것과 같다
  await expect(zoomBtn).toHaveCSS("opacity", "1");
  await page.screenshot({ path: `${SHOTS}/jobs-panel-hover.png` });
  await zoomBtn.click();
  const zoom = page.getByRole("dialog", { name: "크게 보기" });
  await expect(zoom).toBeVisible();
  await page.waitForTimeout(700); // 팝업 등장 애니메이션
  await page.screenshot({ path: `${SHOTS}/jobs-zoom.png` });

  // 바로가기 → 보관함에서 고른 것처럼 편집기
  await zoom.getByRole("button", { name: "바로가기" }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("button", { name: "글자 넣기" })).toBeVisible();
  await expect(page.getByText("페이지 1/1")).toBeVisible();

  // 닫기 전까지 완성 알림이 남아 있다 → 닫으면 사라진다
  await expect(page.getByText("1개 완성됐어요")).toBeVisible();
  await page.getByRole("button", { name: "알림 닫기" }).click();
  await expect(page.getByText("1개 완성됐어요")).toHaveCount(0);
});

test("만드는 도중 다른 화면으로 가도 계속 만들어지고 완성이 표시된다", async ({ page }) => {
  await login(page);
  await slowGenerate(page, 2500);
  await fillWizard(page);
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(page.getByRole("button", { name: /AI가 1개 만드는 중/ })).toBeVisible();

  // 홈으로 이동(앱 안 이동) — 작업은 계속된다
  await page.getByRole("button", { name: /그만두기/ }).click();
  await expect(page).toHaveURL("http://localhost:5173/");
  await expect(page.getByRole("button", { name: /AI가 1개 만드는 중/ })).toBeVisible();
  await expectJobDone(page);
});

test("두 개를 연달아 만들 수 있다", async ({ page }) => {
  await login(page);
  await slowGenerate(page, 2500);
  await fillWizard(page);
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "무엇을 만들까요?" })).toBeVisible();
  // 기다리지 않고 바로 하나 더
  await page.getByRole("button", { name: /배너/ }).first().click();
  await page.getByRole("button", { name: "음식점" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("만들고 싶은 그림 설명").fill("두 번째 배너");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(page.getByRole("button", { name: /AI가 2개 만드는 중/ })).toBeVisible();
  await expect(page.getByText("2개 완성됐어요")).toBeVisible({ timeout: 15_000 });
});

test("편집기 AI 수정은 화면을 벗어나지 않고, 버튼이 돌며 작업 중임을 알린 뒤 새 페이지로 붙는다", async ({ page }) => {
  await login(page);
  await mockProject(page);
  await page.route("**/api/refs/upload", (r) => r.fulfill(OK({ ref_upload_id: "ref1" })));
  // 1) 스튜디오에서 만든 뒤 바로가기로 편집기 열기
  await slowGenerate(page, 300);
  await fillWizard(page);
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await page.getByRole("button", { name: /완성됐어요/ }).click();
  await page.getByRole("dialog", { name: "AI 작업 목록" }).getByRole("button", { name: "바로가기" }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await page.getByRole("button", { name: "알림 닫기" }).click();

  // 2) AI 수정 — 이번 결과는 새 페이지 pg2
  await page.unroute("**/api/generate");
  await slowGenerate(page, 3000, IMG2, "pg2");
  await page.getByRole("button", { name: /AI로 수정/ }).click();
  await page.getByPlaceholder(/매물/).fill("배경을 주황색으로");
  await page.getByRole("button", { name: /AI로 수정하기/ }).click();

  // 화면은 그대로, 버튼이 돌고 작업 중 안내
  await expect(page).toHaveURL(/\/editor$/);
  const aiBtn = page.getByRole("button", { name: "AI 수정 중" });
  await expect(aiBtn).toBeVisible();
  await expect(aiBtn.locator("svg")).toHaveClass(/animate-spin/);
  await expect(page.getByText("이 프로젝트는 지금 AI가 수정하고 있어요")).toBeVisible();
  // 그동안 계속 편집할 수 있다
  await page.getByRole("button", { name: "글자 넣기" }).click();
  await page.screenshot({ path: `${SHOTS}/jobs-editor-busy.png` });

  // 끝나면 새 페이지로 붙고 버튼이 원래대로
  await expect(page.getByText("페이지 2/2")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /AI로 수정/ })).toBeVisible();
  await expect(page.getByText(/AI가 새 페이지를 만들었어요/)).toBeVisible();
});

test("실패한 작업은 패널에서 같은 내용으로 다시 만들 수 있다", async ({ page }) => {
  await login(page);
  let calls = 0;
  await page.route("**/api/generate", async (route) => {
    calls++;
    if (calls === 1) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ detail: { code: "server", message: "AI 서버에 일시적인 문제가 있어요. 잠시 후 다시 시도해 주세요." } }),
      });
      return;
    }
    await route.fulfill(
      OK({ generation_id: "g2", project_id: "p1", project_name: "봄맞이", page_id: "pg1", image_url: IMG, thumb_url: IMG, size: "1024x400", cost_krw: 15, remaining_krw: null }),
    );
  });
  await fillWizard(page);
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(page.getByText("1개 실패했어요")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /자세히 보기/ }).click();
  const panel = page.getByRole("dialog", { name: "AI 작업 목록" });
  await expect(panel.getByText(/AI 서버에 일시적인 문제가 있어요/)).toBeVisible();
  await expect(panel.getByRole("button", { name: "닫기" })).toBeFocused(); // 열리면 포커스가 패널로
  await panel.getByRole("button", { name: /같은 내용으로 다시 만들기/ }).click();
  await expect(panel.getByRole("button", { name: "바로가기" })).toBeVisible({ timeout: 10_000 });
  expect(calls).toBe(2);
  await expect(page.getByText("1개 완성됐어요")).toBeVisible();
});
