import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "yesol.dev@gmail.com";
const ADMIN_PW = "yesol1234";

// 1x1 투명 PNG data URI (모킹 이미지)
const FAKE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호", { exact: true }).fill(ADMIN_PW);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL("http://localhost:5173/", { timeout: 15_000 });
}

test("스튜디오 마법사로 배너를 만든다 (생성 모킹)", async ({ page }) => {
  await login(page);

  // 생성 요청만 모킹 (돈 안 씀)
  await page.route("**/api/generate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        generation_id: "test-id",
        image_url: FAKE_PNG,
        thumb_url: FAKE_PNG,
        size: "1024x400",
        cost_krw: 12,
        remaining_krw: null,
      }),
    });
  });

  // 홈 → 스튜디오
  await page.getByRole("button", { name: /새 홍보물 만들기/ }).click();
  await expect(page).toHaveURL(/\/studio$/);

  // 1단계: 배너 선택 → 2단계 업종
  await page.getByRole("button", { name: /배너/ }).first().click();
  await expect(page.getByRole("heading", { name: "어떤 업종인가요?" })).toBeVisible();
  await page.getByRole("button", { name: "음식점" }).click();
  await expect(page.getByRole("heading", { name: "크기와 품질을 골라요" })).toBeVisible();

  // 예상비용 바(실제 estimate 호출) 노출 확인
  await expect(page.getByText(/한 장에 약/)).toBeVisible({ timeout: 10_000 });

  // 품질 보통 선택 후 다음
  await page.getByRole("button", { name: /보통 \(추천\)/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();

  // 3단계: 설명 입력 + AI 문구 추천
  await expect(page.getByRole("heading", { name: "어떤 그림을 원하세요?" })).toBeVisible();
  await page.getByLabel("만들고 싶은 그림 설명").fill("봄맞이 할인 배너, 밝은 분홍 배경");
  await page.route("**/api/copywrite", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: ["봄맞이 30% 할인", "따뜻한 밥상"] }) }),
  );
  await page.getByRole("button", { name: /문구 추천받기/ }).click();
  await page.getByRole("button", { name: "봄맞이 30% 할인" }).click();
  await expect(page.getByLabel(/더 넣을 글자/)).toHaveValue("봄맞이 30% 할인");
  await page.getByRole("button", { name: "다음", exact: true }).click();

  // 4단계: 요약 확인 후 만들기
  await expect(page.getByRole("heading", { name: "이대로 만들까요?" })).toBeVisible();
  await page.getByRole("button", { name: "만들기", exact: true }).click();

  // 결과 화면
  await expect(page.getByRole("heading", { name: /완성됐어요/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /PNG로 내려받기/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /JPG로 내려받기/ })).toBeVisible();

  // 비슷하게 다시 만들기 → 보완 프롬프트 모달 → 참고 id + 보완 문구 전송 확인
  const regen = page.waitForRequest((r) => {
    if (!r.url().endsWith("/api/generate") || r.method() !== "POST") return false;
    const b = r.postDataJSON();
    return b?.ref_generation_id === "test-id" && String(b?.prompt).includes("더 밝게");
  });
  await page.getByRole("button", { name: /비슷하게 다시 만들기/ }).click();
  await page.getByPlaceholder(/배경을 더 밝게/).fill("배경을 더 밝게");
  await page.getByRole("button", { name: "다시 만들기", exact: true }).click();
  await regen;
  await expect(page.getByRole("heading", { name: /완성됐어요/ })).toBeVisible({ timeout: 10_000 });
});

test("업종 '기타' 선택 시 직접 입력칸이 뜨고 프롬프트에 반영된다", async ({ page }) => {
  await login(page);
  let sent: Record<string, unknown> = {};
  await page.route("**/api/generate", (route) => {
    sent = route.request().postDataJSON();
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generation_id: "g", image_url: FAKE_PNG, thumb_url: FAKE_PNG, size: "500x200", cost_krw: 8, remaining_krw: null }) });
  });

  await page.getByRole("button", { name: /새 홍보물 만들기/ }).click();
  await page.getByRole("button", { name: /배너/ }).first().click();
  // 기타 선택 → 자동 진행 안 함, 입력칸 표시
  await page.getByRole("button", { name: "기타" }).click();
  await expect(page.getByLabel("업종을 직접 적어 주세요")).toBeVisible();
  await expect(page.getByRole("button", { name: "다음", exact: true })).toBeDisabled();
  await page.getByLabel("업종을 직접 적어 주세요").fill("세탁소");
  await expect(page.getByRole("button", { name: "다음", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "다음", exact: true }).click();

  await expect(page.getByRole("heading", { name: "크기와 품질을 골라요" })).toBeVisible();
  await page.getByRole("button", { name: /보통 \(추천\)/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("만들고 싶은 그림 설명").fill("깨끗한 세탁 서비스");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("세탁소", { exact: false })).toBeVisible(); // 요약에 업종
  await page.getByRole("button", { name: "만들기", exact: true }).click();

  await expect(page.getByRole("heading", { name: /완성됐어요/ })).toBeVisible({ timeout: 10_000 });
  expect(String(sent.prompt)).toContain("[업종: 세탁소]");
});

test("참고할 이미지를 최근 생성물에서 고르면 ref_generation_id로 생성된다", async ({ page }) => {
  await login(page);
  // 참고 이미지 선택용 최근 생성 목록 모킹
  await page.route("**/api/generations", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          { id: "prev1", template_id: null, prompt: "지난 배너", size: "500x200", thumb_url: FAKE_PNG, image_url: FAKE_PNG },
        ],
      }),
    }),
  );
  let sent: Record<string, unknown> = {};
  await page.route("**/api/generate", (route) => {
    sent = route.request().postDataJSON();
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generation_id: "g", image_url: FAKE_PNG, thumb_url: FAKE_PNG, size: "500x200", cost_krw: 15, remaining_krw: null }) });
  });

  await page.getByRole("button", { name: /새 홍보물 만들기/ }).click();
  await page.getByRole("button", { name: /배너/ }).first().click();
  await page.getByRole("button", { name: "음식점" }).click();
  await page.getByRole("button", { name: /보통 \(추천\)/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("만들고 싶은 그림 설명").fill("따뜻한 가게 홍보");
  // 최근 만든 이미지에서 참고 이미지 고르기
  await page.getByRole("button", { name: /최근 만든 이미지에서 고르기/ }).click();
  await page.getByRole("button", { name: /지난 배너/ }).click();
  await page.getByRole("button", { name: /빼기/ }).waitFor(); // 선택됨 표시
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "만들기", exact: true }).click();

  await expect(page.getByRole("heading", { name: /완성됐어요/ })).toBeVisible({ timeout: 10_000 });
  expect(sent.ref_generation_id).toBe("prev1");
});

test("직접 크기(mm) 입력이 px로 환산되어 생성된다", async ({ page }) => {
  await login(page);
  let sentBody: Record<string, unknown> = {};
  await page.route("**/api/generate", async (route) => {
    sentBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ generation_id: "t", image_url: FAKE_PNG, thumb_url: FAKE_PNG, size: "x", cost_krw: 5, remaining_krw: null }),
    });
  });

  await page.getByRole("button", { name: /새 홍보물 만들기/ }).click();
  await page.getByRole("button", { name: /전단지/ }).first().click();
  await page.getByRole("button", { name: "부동산·분양" }).click();

  // 직접 크기 → 100 x 200 mm, mm 단위
  await page.getByRole("button", { name: "직접 크기 정하기" }).click();
  await page.getByLabel("가로").fill("100");
  await page.getByLabel("세로").fill("200");
  await page.getByRole("button", { name: "mm", exact: true }).click();
  // 100mm @300DPI ≈ 1181px, 200mm ≈ 2362px
  await expect(page.getByText(/1181×2362 px/)).toBeVisible();

  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("만들고 싶은 그림 설명").fill("동네 청소 안내 전단지");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "만들기", exact: true }).click();

  await expect(page.getByRole("heading", { name: /완성됐어요/ })).toBeVisible({ timeout: 10_000 });
  // 서버로 환산된 px가 전달됐는지 확인
  expect(sentBody.width).toBe(1181);
  expect(sentBody.height).toBe(2362);
});

test("바탕 색을 고르면 프롬프트에 색이 주입된다", async ({ page }) => {
  await login(page);
  let sent: Record<string, unknown> = {};
  await page.route("**/api/generate", (route) => {
    sent = route.request().postDataJSON();
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generation_id: "c", project_id: "p", project_name: "가게 홍보", image_url: FAKE_PNG, thumb_url: FAKE_PNG, size: "500x200", cost_krw: 9, remaining_krw: null }) });
  });

  await page.getByRole("button", { name: /새 홍보물 만들기/ }).click();
  await page.getByRole("button", { name: /배너/ }).first().click();
  await page.getByRole("button", { name: "음식점" }).click();
  await page.getByRole("button", { name: /보통 \(추천\)/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("만들고 싶은 그림 설명").fill("가게 홍보");
  await page.getByRole("button", { name: "파랑", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("전체 색감")).toBeVisible(); // 요약에 색 표시
  await page.getByRole("button", { name: "만들기", exact: true }).click();

  await expect(page.getByRole("heading", { name: /완성됐어요/ })).toBeVisible({ timeout: 10_000 });
  expect(String(sent.prompt)).toContain("파랑");
});
