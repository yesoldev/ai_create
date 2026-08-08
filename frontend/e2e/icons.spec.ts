import { test, expect } from "@playwright/test";

// 아이콘이 오프라인 번들에서 나오는지 검증.
// api.iconify.design 을 끊어도(사내망·오프라인 상황) 아이콘이 그대로 보여야 한다.
test("아이콘은 원격 요청 없이 번들에서 렌더된다", async ({ page }) => {
  // Iconify는 iconify.design 이 막히면 simplesvg·unisvg 로 넘어간다 → 셋 다 끊는다
  const ICON_API = /(api\.iconify\.design|api\.simplesvg\.com|api\.unisvg\.com)/;
  const remote: string[] = [];
  page.on("request", (r) => {
    if (ICON_API.test(r.url())) remote.push(r.url());
  });
  await page.route(ICON_API, (r) => r.abort());

  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill("yesol.dev@gmail.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("yesol1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL("http://localhost:5173/", { timeout: 15_000 });
  await page.getByRole("button", { name: /새 홍보물 만들기/ }).click();
  await page.getByRole("button", { name: /배너/ }).first().click();
  // 업종 화면: 업종 카드 10개가 각각 아이콘을 가진다 → 아이콘이 죽으면 svg 수가 급감
  await expect(page.getByRole("heading", { name: "어떤 업종인가요?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "유흥업소" })).toBeVisible();
  // svg 껍데기는 아이콘 데이터가 없어도 렌더되므로 실제 도형(path)이 있는지로 확인한다
  await expect.poll(() => page.locator("svg path").count(), { timeout: 10_000 }).toBeGreaterThan(10);

  expect(remote, "아이콘을 원격에서 받아오면 안 된다").toEqual([]);
});
