// 백엔드 없이 도는 E2E용 공통 헬퍼 (모든 /api 응답 모킹).
// 실행: PW_NO_BACKEND=1 npx playwright test e2e/<spec>.ts
import { expect, type Page } from "@playwright/test";

export const FAKE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/** 크기가 명확한 테스트용 이미지(SVG data URI) — 자르기 계산 검증용 */
export function svgImage(w: number, h: number, fill = "#3b82f6"): string {
  return (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`,
    )
  );
}

export const OK = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

/** 로그인·홈·스튜디오·편집기가 부르는 API를 전부 모킹. */
export async function mockBackend(page: Page) {
  await page.route("**/api/**", (r) => r.fulfill(OK({ items: [] })));
  await page.route("**/api/auth/login", (r) => r.fulfill(OK({ access_token: "t", refresh_token: "r" })));
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

export async function login(page: Page) {
  await mockBackend(page);
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill("test@test.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("pw");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL("http://localhost:5173/", { timeout: 15_000 });
}

/** 스튜디오 마법사를 '만들기' 직전까지 진행. */
export async function fillWizard(page: Page) {
  await page.getByRole("button", { name: /새 홍보물 만들기/ }).click();
  await page.getByRole("button", { name: /배너/ }).first().click();
  await page.getByRole("button", { name: "음식점" }).click();
  await page.getByRole("button", { name: /보통 \(추천\)/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("만들고 싶은 그림 설명").fill("봄맞이 할인 배너");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("heading", { name: "이대로 만들까요?" })).toBeVisible();
}
