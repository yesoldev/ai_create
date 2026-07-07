import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill("yesol.dev@gmail.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("yesol1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL("http://localhost:5173/", { timeout: 15_000 });
}

const USERS = {
  year_month: "2026-07",
  items: [
    { id: "u1", email: "boss@oapms.com", name: "관리자", role: "admin", is_active: true, monthly_limit_krw: null, used_krw: 1200 },
    { id: "u2", email: "hong@oapms.com", name: "홍길동", role: "user", is_active: true, monthly_limit_krw: 15000, used_krw: 3000 },
  ],
};

test("관리자 화면: 목록 표시·계정 추가·상태 변경", async ({ page }) => {
  // 모든 admin API 모킹 (실계정 생성 방지)
  await page.route("**/api/admin/users", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "u3", email: "new@oapms.com" }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(USERS) });
    }
  });
  await page.route("**/api/admin/users/*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "u2" }) }),
  );

  await login(page);
  await page.getByRole("button", { name: /관리자/ }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // 목록 렌더
  await expect(page.getByRole("heading", { name: "계정 관리" })).toBeVisible();
  await expect(page.getByText("hong@oapms.com")).toBeVisible();
  await expect(page.getByText("boss@oapms.com")).toBeVisible();

  // 계정 추가 폼
  await page.getByRole("button", { name: /계정 추가/ }).click();
  await page.getByPlaceholder("name@company.com").fill("new@oapms.com");
  await page.getByPlaceholder("6자 이상").fill("pw123456");
  const createReq = page.waitForRequest((r) => r.url().includes("/api/admin/users") && r.method() === "POST");
  await page.getByRole("button", { name: /^만들기/ }).click();
  await createReq;

  // 상태 변경(사용 중지) → PATCH 발생
  const patchReq = page.waitForRequest((r) => /\/api\/admin\/users\//.test(r.url()) && r.method() === "PATCH");
  await page.getByRole("button", { name: "사용 중지" }).first().click();
  await patchReq;
});
