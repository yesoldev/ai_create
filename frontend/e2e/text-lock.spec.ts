// 자유도(변주)가 걸려도 '글자'는 자유롭게 생성되면 안 된다 — 프롬프트 잠금 검증.
// 실행: PW_NO_BACKEND=1 npx playwright test e2e/text-lock.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { OK, login, svgImage } from "./helpers";

const IMG = svgImage(500, 200);

/** 마법사를 돌며 업체명·문구를 넣고 자유도를 골라 생성 → 보낸 요청 본문 반환 */
async function generateWith(page: Page, freedomLabel: string) {
  let sent: Record<string, unknown> = {};
  await page.route("**/api/generate", (r) => {
    sent = r.request().postDataJSON();
    return r.fulfill(
      OK({
        generation_id: "g1", project_id: "t1", project_name: "행복식당", page_id: "pg1",
        image_url: IMG, thumb_url: IMG, size: "500x200", cost_krw: 70, remaining_krw: null,
      }),
    );
  });

  await page.getByRole("button", { name: /새 홍보물 만들기/ }).click();
  await page.getByRole("button", { name: /배너/ }).first().click();
  await page.getByRole("button", { name: "음식점" }).click();
  await page.getByRole("button", { name: /보통 \(추천\)/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("만들고 싶은 그림 설명").fill("봄맞이 할인 배너");
  await page.getByLabel(/업체명/).fill("행복식당");
  await page.getByLabel(/더 넣을 글자/).fill("봄맞이 30% 할인");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(freedomLabel) }).click();
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(page.getByRole("heading", { name: /완성됐어요/ })).toBeVisible({ timeout: 10_000 });
  return sent;
}

test("자유도 '매번 새롭게'여도 글자는 변주 대상에서 제외된다", async ({ page }) => {
  await login(page);
  const sent = await generateWith(page, "매번 새롭게");
  const prompt = String(sent.prompt);

  // 그림 변주는 걸리고
  expect(prompt).toMatch(/그림체는/);
  // 글자는 잠근다
  expect(prompt).toContain("글자는 변주 대상이 아니다");
  expect(prompt).toContain("지어내지 마");
  // 넣을 문구는 별도 필드로 정확히 전달(백엔드가 글자 규칙을 붙인다)
  expect(sent.text_content).toBe("행복식당\n봄맞이 30% 할인");
});

test("자유도 '적당히 다르게'에도 글자 잠금이 붙는다", async ({ page }) => {
  await login(page);
  const sent = await generateWith(page, "적당히 다르게");
  const prompt = String(sent.prompt);
  expect(prompt).toMatch(/이번 그림은/); // 구도·빛 변주
  expect(prompt).not.toMatch(/그림체는/); // 그림체까지는 안 바꿈
  expect(prompt).toContain("글자는 변주 대상이 아니다");
});

test("자유도 '안정적으로'는 변주 문구 자체가 없다", async ({ page }) => {
  await login(page);
  const sent = await generateWith(page, "안정적으로");
  const prompt = String(sent.prompt);
  expect(prompt).not.toMatch(/이번 그림은/);
  expect(prompt).not.toMatch(/그림체는/);
});
