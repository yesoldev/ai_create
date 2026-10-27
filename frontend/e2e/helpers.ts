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
export async function mockBackend(page: Page, role: "user" | "admin" = "user") {
  await page.route("**/api/**", (r) => r.fulfill(OK({ items: [] })));
  await page.route("**/api/auth/login", (r) => r.fulfill(OK({ access_token: "t", refresh_token: "r" })));
  await page.route("**/api/auth/me", (r) =>
    r.fulfill(
      OK({ id: "u1", email: "test@test.com", name: "테스트", role, monthly_limit_krw: null }),
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

export async function login(page: Page, role: "user" | "admin" = "user") {
  await mockBackend(page, role);
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

/** 백그라운드 생성이 끝날 때까지 기다린다(상단 알림 바의 '완성됐어요') */
export async function expectJobDone(page: Page) {
  await expect(page.getByText(/개 완성됐어요/)).toBeVisible({ timeout: 15_000 });
}

/** 상단 알림 → 작업 패널 → '바로가기'로 결과 프로젝트를 편집기에서 연다(보관함에서 고른 것과 같다) */
export async function openLatestResult(page: Page, opts: { image?: string; w?: number; h?: number } = {}) {
  const { image = FAKE_PNG, w = 1024, h = 400 } = opts;
  // 프로젝트 상세(GET /api/templates/{id}) 모킹 — 나중에 등록한 라우트가 먼저 걸린다
  await page.route(/\/api\/templates\/[^/?]+$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const id = new URL(route.request().url()).pathname.split("/").pop();
    await route.fulfill(
      OK({
        id,
        name: "테스트 프로젝트",
        canvas_json: null,
        size_w: w,
        size_h: h,
        folder_id: null,
        bg_url: image,
        thumb_url: image,
        pages: [{ id: "pg1", sort_order: 0, bg_url: image, thumb_url: image, canvas_json: null }],
      }),
    );
  });
  await expectJobDone(page);
  await page.getByRole("button", { name: /자세히 보기/ }).click();
  await page.getByRole("dialog", { name: "AI 작업 목록" }).getByRole("button", { name: "바로가기" }).first().click();
  await expect(page).toHaveURL(/\/editor$/);
}
