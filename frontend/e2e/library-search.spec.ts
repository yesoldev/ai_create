// 보관함 제목 검색 + 로그인 아이디 저장 E2E (백엔드 모킹).
// 실행: PW_NO_BACKEND=1 npx playwright test e2e/library-search.spec.ts
import { test, expect } from "@playwright/test";
import { OK, login, mockBackend } from "./helpers";

const ITEMS = [
  { id: "1", name: "행복식당 봄 배너", size_w: 500, size_h: 200, updated_at: "2026-08-01" },
  { id: "2", name: "행복식당 여름 전단지", size_w: 1773, size_h: 3189, updated_at: "2026-08-02" },
  { id: "3", name: "미소카페 오픈 안내", size_w: 500, size_h: 200, updated_at: "2026-08-03" },
];

test("보관함에서 제목으로 찾을 수 있다", async ({ page }) => {
  await login(page);
  await page.route("**/api/templates", (r) => r.fulfill(OK({ items: ITEMS })));
  await page.goto("/library");

  await expect(page.getByRole("heading", { name: "저장한 홍보물" })).toBeVisible();
  for (const it of ITEMS) await expect(page.getByText(it.name)).toBeVisible();

  // '행복식당' → 2개
  await page.getByLabel("제목으로 찾기").fill("행복식당");
  await expect(page.getByText("2개")).toBeVisible();
  await expect(page.getByText("미소카페 오픈 안내")).toBeHidden();

  // 대소문자·부분 일치 ('카페')
  await page.getByLabel("제목으로 찾기").fill("카페");
  await expect(page.getByText("미소카페 오픈 안내")).toBeVisible();
  await expect(page.getByText("행복식당 봄 배너")).toBeHidden();

  // 없는 제목 → 안내 + 지우고 전체 보기
  await page.getByLabel("제목으로 찾기").fill("없는제목");
  await expect(page.getByText(/이\(가\) 들어간 홍보물이 없어요/)).toBeVisible();
  await page.getByRole("button", { name: /검색어 지우고 전체 보기/ }).click();
  for (const it of ITEMS) await expect(page.getByText(it.name)).toBeVisible();
});

test("아이디 저장이 기본으로 켜져 있고, 다음 방문에 아이디가 채워진다", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/login");

  const save = page.getByRole("checkbox", { name: /아이디 저장/ });
  await expect(save).toBeChecked(); // 기본 체크
  await page.getByLabel("이메일", { exact: true }).fill("test@test.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("pw");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL("http://localhost:5173/", { timeout: 15_000 });

  // 로그아웃(토큰만 지움) 후 다시 로그인 화면으로 → 아이디가 채워져 있다
  await page.evaluate(() => {
    localStorage.removeItem("ac_token");
    localStorage.removeItem("ac_refresh");
  });
  await page.goto("/login");
  await expect(page.getByLabel("이메일", { exact: true })).toHaveValue("test@test.com");

  // 체크를 풀고 로그인하면 다음엔 비어 있다
  await page.getByRole("checkbox", { name: /아이디 저장/ }).uncheck();
  await page.getByLabel("비밀번호", { exact: true }).fill("pw");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL("http://localhost:5173/", { timeout: 15_000 });
  await page.evaluate(() => {
    localStorage.removeItem("ac_token");
    localStorage.removeItem("ac_refresh");
  });
  await page.goto("/login");
  await expect(page.getByLabel("이메일", { exact: true })).toHaveValue("");
  await expect(page.getByRole("checkbox", { name: /아이디 저장/ })).not.toBeChecked();
});
