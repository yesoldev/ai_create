// 편집기 이미지 자르기 E2E — 백엔드 없이 모킹으로 돈다.
// 실행: PW_NO_BACKEND=1 npx playwright test e2e/crop.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { OK, login, fillWizard, svgImage } from "./helpers";

// 400×200 그림 → 편집기 표시 배율 1배(창 1280×720 기준)라 자르기 계산이 그대로 보인다
const IMG = svgImage(400, 200);
const CROPPED = svgImage(200, 200, "#ef4444");

/** 생성 결과 → 편집기까지 진입 */
async function openEditor(page: Page) {
  await page.route("**/api/generate", (r) =>
    r.fulfill(
      OK({
        generation_id: "g1",
        project_id: "t1",
        project_name: "봄맞이",
        page_id: "pg1",
        image_url: IMG,
        thumb_url: IMG,
        size: "400x200",
        cost_krw: 70,
        remaining_krw: null,
      }),
    ),
  );
  await fillWizard(page);
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(page.getByRole("heading", { name: /완성됐어요/ })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /글자 수정 또는 추가/ }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("button", { name: "자르기" })).toBeEnabled();
}

test("자를 영역을 정해 자르면 새 이미지로 저장된다", async ({ page }) => {
  await login(page);
  await openEditor(page);

  let uploadedTo = "";
  await page.route("**/api/templates/*/pages/*/image", (r) => {
    uploadedTo = r.request().url();
    return r.fulfill(
      OK({ page_id: "pg1", size_w: 200, size_h: 200, image_url: CROPPED, thumb_url: CROPPED }),
    );
  });

  await page.getByRole("button", { name: "자르기" }).click();
  await expect(page.getByText("남길 부분을 정해 주세요")).toBeVisible();
  // 처음엔 가운데 80% (400×200 → 320×160)
  await expect(page.getByText("자른 크기 320×160px")).toBeVisible();

  // 정사각형 모양 → 세로에 맞춰 200×200
  await page.getByRole("button", { name: "정사각형" }).click();
  await expect(page.getByText("자른 크기 200×200px")).toBeVisible();

  // 자르기 → 되돌릴 수 없다는 확인 후 진행
  await page.getByRole("button", { name: "이 부분만 남기기" }).click();
  await expect(page.getByRole("heading", { name: "이 부분만 남기고 자를까요?" })).toBeVisible();
  const put = page.waitForRequest(
    (r) => r.method() === "PUT" && /\/api\/templates\/t1\/pages\/pg1\/image$/.test(r.url()),
  );
  await page.getByRole("button", { name: "자르기", exact: true }).last().click();
  await put;

  await expect(page.getByText(/사진을 잘랐어요\. \(200×200px\)/)).toBeVisible({ timeout: 10_000 });
  expect(uploadedTo).toMatch(/\/api\/templates\/t1\/pages\/pg1\/image$/);
  // 자르기 바는 닫히고, 잘린 크기로 다시 편집할 수 있다
  await expect(page.getByText("남길 부분을 정해 주세요")).toBeHidden();
  await page.getByRole("button", { name: "자르기" }).click();
  await expect(page.getByText("자른 크기 160×160px")).toBeVisible(); // 200×200의 80%
});

test("모서리를 끌면 자를 크기가 바뀌고, 그만두면 원본 그대로다", async ({ page }) => {
  await login(page);
  await openEditor(page);

  await page.getByRole("button", { name: "자르기" }).click();
  await expect(page.getByText("자른 크기 320×160px")).toBeVisible();
  // 자르는 동안엔 글자·도형 편집과 내려받기를 잠근다(실수 방지)
  await expect(page.getByRole("button", { name: "글자 넣기" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "PNG", exact: true })).toBeDisabled();

  // 오른쪽 아래 손잡이를 안쪽으로 60px 끌기 → 320-60=260 폭
  const grip = page.locator(".cursor-nwse-resize").last();
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2 - 60, g.y + g.height / 2 - 40, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText("자른 크기 260×120px")).toBeVisible();

  // 그만두기 → 자르기 바 닫히고 이미지는 그대로(다시 열면 원본 400×200 기준)
  await page.getByRole("button", { name: "그만두기" }).click();
  await expect(page.getByText("남길 부분을 정해 주세요")).toBeHidden();
  await expect(page.getByRole("button", { name: "글자 넣기" })).toBeEnabled();
  await page.getByRole("button", { name: "자르기" }).click();
  await expect(page.getByText("자른 크기 320×160px")).toBeVisible();
});

test("자르기 저장에 실패하면 한글 안내가 뜬다", async ({ page }) => {
  await login(page);
  await openEditor(page);
  await page.route("**/api/templates/*/pages/*/image", (r) =>
    r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: {} }) }),
  );

  await page.getByRole("button", { name: "자르기" }).click();
  await page.getByRole("button", { name: "이 부분만 남기기" }).click();
  await page.getByRole("button", { name: "자르기", exact: true }).last().click();
  await expect(page.getByText(/서버에 일시적인 문제가 있어요/)).toBeVisible({ timeout: 10_000 });
});
