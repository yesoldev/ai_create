import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "yesol.dev@gmail.com";
const ADMIN_PW = "yesol1234";

test("올바른 계정으로 로그인하면 홈으로 이동한다", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();

  await page.getByLabel("이메일", { exact: true }).fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호", { exact: true }).fill(ADMIN_PW);
  await page.getByRole("button", { name: "로그인" }).click();

  // Supabase 실서버 왕복(로그인+프로필)에 시간이 걸릴 수 있어 넉넉히 대기
  await expect(page).toHaveURL("http://localhost:5173/", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /새 홍보물 만들기/ })).toBeVisible();
});

test("틀린 비밀번호는 오류 메시지를 보여준다", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page.getByRole("alert")).toContainText("올바르지 않습니다");
  await expect(page).toHaveURL(/\/login$/);
});

test("비밀번호 보기 토글이 동작한다", async ({ page }) => {
  await page.goto("/login");
  const pw = page.getByLabel("비밀번호", { exact: true });
  await expect(pw).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "비밀번호 보기" }).click();
  await expect(pw).toHaveAttribute("type", "text");
});
