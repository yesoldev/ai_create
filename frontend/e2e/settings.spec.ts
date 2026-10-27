// 관리자 AI 모델 설정(전 직원 적용) + 계정별 마지막 크기 기억(배너·전단지 따로) E2E.
// 백엔드 없이 돈다(모든 /api 응답 모킹). 실행: PW_NO_BACKEND=1 npx playwright test e2e/settings.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { FAKE_PNG, OK, login } from "./helpers";

const SHOTS = "../.ui-design/shots";

/** /api/generate 요청 본문을 모아 두고 바로 성공시킨다 */
async function captureGenerate(page: Page) {
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/generate", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill(
      OK({ generation_id: "g1", project_id: "p1", project_name: "봄맞이", page_id: "pg1", image_url: FAKE_PNG, thumb_url: FAKE_PNG, size: "800x200", cost_krw: 15, remaining_krw: null }),
    );
  });
  return bodies;
}

/** 종류 → 업종까지 고르고 '크기와 품질' 단계에 선다 */
async function toSizeStep(page: Page, kind: "배너" | "전단지") {
  await page.getByRole("button", { name: new RegExp(kind) }).first().click();
  await page.getByRole("button", { name: "음식점" }).click();
  await expect(page.getByRole("heading", { name: "크기와 품질을 골라요" })).toBeVisible();
}

async function finishAndMake(page: Page) {
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("만들고 싶은 그림 설명").fill("봄맞이 할인");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(page.getByText(/만들기를 시작했어요/)).toBeVisible();
}

test("관리자 화면에서 AI 모델을 바꾸면 저장되고 '사용 중'이 옮겨 간다", async ({ page }) => {
  await login(page, "admin");
  let saved = "gpt-image-2";
  const patched: string[] = [];
  await page.route("**/api/settings/image-model", async (route) => {
    if (route.request().method() === "PATCH") {
      saved = route.request().postDataJSON().model;
      patched.push(saved);
      return route.fulfill(OK({ model: saved }));
    }
    return route.fulfill(OK({ model: saved, default: "gpt-image-2", choices: ["gpt-image-2", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst"] }));
  });
  await page.goto("/admin");
  const card = page.locator("section", { has: page.getByRole("heading", { name: "AI 그림 모델" }) });
  await expect(card.getByRole("button", { name: /gpt-image-2.*사용 중|사용 중.*gpt-image-2/ })).toBeVisible();
  await expect(card.getByRole("button", { name: "이 모델로 바꾸기" })).toBeDisabled(); // 바꾼 게 없으면 못 누름

  await card.getByRole("button", { name: /2\.5 정밀형/ }).click();
  await expect(card.getByText("아직 저장하지 않았어요")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/admin-model-card.png`, fullPage: true });
  await card.getByRole("button", { name: "이 모델로 바꾸기" }).click();

  await expect(page.getByText(/AI 모델을 '2.5 정밀형'\(으\)로 바꿨습니다/)).toBeVisible();
  expect(patched).toEqual(["gpt-image-2.5-sunburst"]);
  await expect(card.getByRole("button", { name: /2\.5 정밀형/ })).toContainText("사용 중");
  await expect(card.getByRole("button", { name: /^gpt-image-2/ })).not.toContainText("사용 중");
});

test("생성 화면에는 모델 선택이 없고(관리자도), 생성 요청에 model을 보내지 않는다", async ({ page }) => {
  await login(page, "admin");
  const bodies = await captureGenerate(page);
  await page.getByRole("button", { name: /새 홍보물 만들기/ }).click();
  await toSizeStep(page, "배너");
  await expect(page.getByText("AI 모델")).toHaveCount(0);
  await expect(page.getByText("관리자만 보여요")).toHaveCount(0);
  await finishAndMake(page);
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).not.toHaveProperty("model");
});

test("직접 정한 크기로 만들면 다음엔 그 크기가 골라져 있다 — 배너·전단지 따로", async ({ page }) => {
  await login(page);
  const bodies = await captureGenerate(page);
  await page.getByRole("button", { name: /새 홍보물 만들기/ }).click();

  // 처음엔 추천(기본) 크기
  await toSizeStep(page, "배너");
  await expect(page.getByRole("button", { name: /기본 크기/ })).toHaveAttribute("aria-pressed", "true");

  // 직접 800×200으로 만들기
  await page.getByRole("button", { name: /직접 크기 정하기/ }).click();
  const nums = page.getByRole("spinbutton");
  await nums.nth(0).fill("800");
  await nums.nth(1).fill("200");
  await finishAndMake(page);
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0].size_choice).toEqual({ kind: "banner", mode: "custom", custom_w: 800, custom_h: 200, custom_unit: "px" });
  expect(bodies[0]).toMatchObject({ width: 800, height: 200 });

  // 바로 다음 배너: 직접 크기 800×200이 골라져 있다
  await toSizeStep(page, "배너");
  await expect(page.getByRole("button", { name: /직접 크기 정하기/ })).toHaveAttribute("aria-pressed", "true");
  await expect(nums.nth(0)).toHaveValue("800");
  await expect(nums.nth(1)).toHaveValue("200");
  await expect(page.getByText("지난번에 만든 크기로 골라 뒀어요")).toBeVisible();
  await page.waitForTimeout(700); // 단계 전환 애니메이션
  await page.screenshot({ path: `${SHOTS}/size-remembered.png`, fullPage: true });

  // 전단지는 따로 — 기억이 없으니 추천(기본) 크기
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await toSizeStep(page, "전단지");
  await expect(page.getByRole("button", { name: /기본 크기/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /직접 크기 정하기/ })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("지난번에 만든 크기로 골라 뒀어요")).toHaveCount(0);
});

test("계정에 저장된 크기를 불러와 미리 골라 둔다(다시 들어와도 유지)", async ({ page }) => {
  await login(page);
  await page.route("**/api/settings/my-sizes", (route) =>
    route.fulfill(
      OK({
        banner: { mode: "custom", preset_key: null, custom: { w: 90, h: 30, unit: "mm" } },
        flyer: { mode: "preset", preset_key: "flyer_a4_300", custom: { w: 210, h: 297, unit: "mm" } },
      }),
    ),
  );
  await page.getByRole("button", { name: /새 홍보물 만들기/ }).click();

  // 전단지: 지난번 고른 추천 크기(A4 인쇄용)
  await toSizeStep(page, "전단지");
  await expect(page.getByRole("button", { name: /전단지 A4/ })).toHaveAttribute("aria-pressed", "true");

  // 배너: 지난번 직접 크기 90×30mm
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await toSizeStep(page, "배너");
  await expect(page.getByRole("button", { name: /직접 크기 정하기/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("spinbutton").nth(0)).toHaveValue("90");
  await expect(page.getByRole("spinbutton").nth(1)).toHaveValue("30");
  await expect(page.getByRole("button", { name: "mm", exact: true })).toHaveClass(/bg-emerald-600/);
});
