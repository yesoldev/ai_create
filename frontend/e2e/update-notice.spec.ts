// 새 버전 알림 E2E — 열어 둔 화면이 배포된 새 버전을 알아채고 새로고침을 권한다.
// 실행: PW_NO_BACKEND=1 npx playwright test e2e/update-notice.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { OK, login, fillWizard, svgImage } from "./helpers";

const NEW_HTML = '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-NEWBUILD.js"></script></head><body></body></html>';

async function enableCheck(page: Page, html: () => string) {
  await page.addInitScript(() => {
    (window as unknown as { __FORCE_UPDATE_CHECK__: boolean }).__FORCE_UPDATE_CHECK__ = true;
  });
  await page.route(/\/index\.html\?v=\d+/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: html() }));
}

test("서버에 새 버전이 올라오면 새로고침 안내를 띄운다", async ({ page }) => {
  await enableCheck(page, () => NEW_HTML);
  await login(page);
  const notice = page.getByRole("alert").filter({ hasText: "새 버전이 나왔어요" });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("button", { name: "지금 새로고침" })).toBeEnabled();
  await page.screenshot({ path: "../.ui-design/shots/update-notice.png" });
});

test("같은 버전이면 아무것도 안 띄운다", async ({ page }) => {
  // 지금 화면과 같은 첫 스크립트를 돌려준다
  let same = "";
  await enableCheck(page, () => same);
  await page.goto("/login");
  same = await page.content();
  await login(page);
  await page.waitForTimeout(800);
  await expect(page.getByText("새 버전이 나왔어요")).toHaveCount(0);
});

test("만드는 중이면 끝난 뒤에 새로고침하라고 하고 버튼을 잠근다", async ({ page }) => {
  await enableCheck(page, () => NEW_HTML);
  await login(page);
  const img = svgImage(1024, 400);
  await page.route("**/api/generate", async (r) => {
    await new Promise((res) => setTimeout(res, 4000));
    await r.fulfill(OK({ generation_id: "g", project_id: "p", project_name: "x", page_id: "pg", image_url: img, thumb_url: img, size: "1024x400", cost_krw: 1, remaining_krw: null }));
  });
  await fillWizard(page);
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  // 창으로 돌아오면 다시 확인한다
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const notice = page.getByRole("alert").filter({ hasText: "새 버전이 나왔어요" });
  await expect(notice.getByText(/지금 만드는 그림이 끝난 뒤에 새로고침해 주세요/)).toBeVisible();
  await expect(notice.getByRole("button", { name: "지금 새로고침" })).toBeDisabled();
  // 다 만들면 버튼이 풀린다
  await expect(notice.getByRole("button", { name: "지금 새로고침" })).toBeEnabled({ timeout: 10_000 });
});
