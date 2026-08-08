import { api } from "./api";

export interface SizePreset {
  key: string;
  label: string;
  w: number;
  h: number;
  hint: string;
}

// 백엔드 config.SIZE_PRESETS 와 맞춤 (계획서 §8: A4 + 샘플 둘 다)
export const SIZES: Record<"banner" | "flyer", SizePreset[]> = {
  banner: [
    { key: "banner_wide", label: "가로 배너", w: 500, h: 200, hint: "기본 · 홈페이지·현수막 느낌" },
    { key: "banner_square", label: "정사각 배너", w: 1024, h: 1024, hint: "SNS 게시물" },
  ],
  flyer: [
    { key: "flyer_sample", label: "전단지 (보통)", w: 1773, h: 3189, hint: "기본 · 화면·간단 인쇄" },
    { key: "flyer_a4_300", label: "전단지 A4 (인쇄용)", w: 2480, h: 3508, hint: "300DPI · 인쇄소 표준" },
  ],
};

// 관리자 설정 기본 사이즈 (배너/전단지) — /api/settings/default-sizes
export interface DefaultSizes {
  banner: { w: number; h: number };
  flyer: { w: number; h: number };
}
export async function fetchDefaultSizes(): Promise<DefaultSizes> {
  const { data } = await api.get<DefaultSizes>("/api/settings/default-sizes");
  return data;
}
export async function saveDefaultSizes(v: {
  banner_w: number;
  banner_h: number;
  flyer_w: number;
  flyer_h: number;
}): Promise<void> {
  await api.patch("/api/settings/default-sizes", v);
}

// 딸깍 빠른 시작 — 용도별 설명 자동 채우기(초보 사용자 배려)
export interface QuickStart {
  key: string;
  icon: string;
  label: string;
  description: string;
}
// 설명은 "분위기·배경"만 안내 — 글자 정보는 넣지 않도록(광고형은 글자 적어야 눈에 띔)
export const QUICK_STARTS: QuickStart[] = [
  { key: "job", icon: "ph:briefcase-duotone", label: "구인 공고", description: "직원 채용 느낌, 신뢰감 있고 깔끔한 밝은 배경" },
  { key: "sale", icon: "ph:tag-duotone", label: "할인 행사", description: "할인 행사 느낌, 밝고 눈에 잘 띄는 활기찬 배경" },
  { key: "open", icon: "ph:storefront-duotone", label: "새 개업", description: "새 가게 개업 느낌, 축하하는 화사하고 밝은 배경" },
  { key: "recruit", icon: "ph:users-three-duotone", label: "회원 모집", description: "회원 모집 느낌, 믿음이 가는 깔끔하고 따뜻한 배경" },
  { key: "event", icon: "ph:calendar-check-duotone", label: "행사 안내", description: "행사 느낌, 정돈되고 산뜻한 배경" },
  { key: "notice", icon: "ph:megaphone-duotone", label: "안내문", description: "안내 느낌, 차분하고 깔끔한 배경" },
];

// 업종 선택 (신문 지면 광고용 이미지)
export interface BizType {
  key: string;
  icon: string;
  label: string;
}
export const BUSINESS_TYPES: BizType[] = [
  { key: "food", icon: "ph:fork-knife-duotone", label: "음식점" },
  { key: "cafe", icon: "ph:coffee-duotone", label: "카페·디저트" },
  { key: "medical", icon: "ph:first-aid-kit-duotone", label: "병원·의원" },
  { key: "academy", icon: "ph:student-duotone", label: "학원·교육" },
  { key: "realestate", icon: "ph:buildings-duotone", label: "부동산·분양" },
  { key: "beauty", icon: "ph:scissors-duotone", label: "미용·뷰티" },
  { key: "retail", icon: "ph:shopping-bag-duotone", label: "가게·쇼핑" },
  { key: "nightlife", icon: "ph:martini-duotone", label: "유흥업소" },
  { key: "public", icon: "ph:megaphone-duotone", label: "행사·공공" },
  { key: "etc", icon: "ph:dots-three-circle-duotone", label: "기타" },
];

// 배경 색상 12종 — 고르면 프롬프트에 색을 주입(모델이 그 색 위주로 생성)
export interface ColorChoice {
  name: string;
  hex: string;
}
export const COLORS: ColorChoice[] = [
  { name: "빨강", hex: "#ef4444" },
  { name: "주황", hex: "#f97316" },
  { name: "노랑", hex: "#f5c518" },
  { name: "초록", hex: "#22c55e" },
  { name: "청록", hex: "#14b8a6" },
  { name: "하늘", hex: "#38bdf8" },
  { name: "파랑", hex: "#3b82f6" },
  { name: "남색", hex: "#1e40af" },
  { name: "보라", hex: "#8b5cf6" },
  { name: "분홍", hex: "#ec4899" },
  { name: "검정", hex: "#111827" },
  { name: "흰색", hex: "#f8fafc" },
];

// 인쇄용 광고 맥락 — 프롬프트에 항상 덧붙임.
// ⚠ "신문 지면" 이라는 단어는 모델이 '누런 신문지·세피아 종이색'으로 해석해
//   전체를 갈색 톤으로 물들이므로 절대 넣지 않는다.
// 광고형 배너는 글자가 많으면 눈에 안 들어옴 → 글자는 최소한, 그림 위주로.
export const NEWSPAPER_HINT =
  "인쇄용 홍보 광고 이미지. 깔끔하고 선명하며 색이 밝고 또렷하게. " +
  "특별히 색을 지정하지 않았으면 밝고 깨끗한 배경(흰색이나 밝은 색)을 쓰고, " +
  "누렇거나 갈색·세피아·신문지 같은 칙칙한 색조는 쓰지 마. " +
  "지정한 문구와 업체명만 크게 넣고, 전화번호·주소 같은 지어낸 정보나 긴 문장은 넣지 마. " +
  "글자는 최소한으로만, 나머지는 그림과 여백으로 채워 한눈에 들어오게 만들어줘.";

// 전단지(세로형)용 맥락 — 전단지는 글자가 많음. 제공한 문구를 구조적으로 배치.
export const FLYER_HINT =
  "세로로 긴 인쇄용 전단지 광고 이미지. 흰 종이나 깔끔한 배경 위에, " +
  "업체명은 위쪽에 크고 눈에 띄는 제목으로, 나머지 문구는 항목(불릿)과 " +
  "연락처(전화·위치)로 구분해 위에서 아래로 읽기 쉽게 배치해줘. " +
  "제공한 한글 문구를 오탈자 없이 정확히 그대로 넣고, 없는 정보는 지어내지 마. " +
  "색은 밝고 선명하게, 누렇거나 세피아 톤은 쓰지 마.";

// ───────── 매번 다른 그림이 나오게 하는 '연출 변주' ─────────
// 이미지 API에는 seed/temperature 같은 파라미터가 없다. 같은 프롬프트를 보내면
// 모델이 늘 자기가 가장 전형적이라고 생각하는 그림을 그린다(예: 유흥업소→왕관).
// 그래서 매 생성마다 구도·조명·그래픽 스타일을 무작위로 바꿔 넣어 결과를 흩뜨린다.
const COMPOSITIONS = [
  "주인공 요소를 왼쪽에 크게 두고 오른쪽은 여백으로 비운 구도",
  "가운데를 비우고 위아래로 요소를 나눈 대칭 구도",
  "대각선으로 흐르는 역동적인 구도",
  "위에서 내려다본 평면(플랫레이) 구도",
  "가까이 클로즈업해 질감이 보이는 구도",
  "넓은 배경 위에 작은 요소들이 흩어진 여백 많은 구도",
];
const LIGHTINGS = [
  "부드러운 자연광",
  "선명한 대비의 스튜디오 조명",
  "따뜻한 노을빛 조명",
  "맑고 균일한 한낮 조명",
  "은은한 역광과 부드러운 그림자",
];
const STYLES = [
  "사실적인 사진 느낌",
  "납작한 벡터 일러스트 느낌",
  "종이를 오려 붙인 콜라주 느낌",
  "손그림 수채 일러스트 느낌",
  "굵은 도형과 큰 색면을 쓴 그래픽 포스터 느낌",
  "미니멀한 모던 그래픽 느낌",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 자유도 — 변주를 얼마나 세게 걸지. 사용자가 고르고 세션 동안 유지된다.
export type Freedom = "safe" | "normal" | "wild";
export interface FreedomChoice {
  key: Freedom;
  icon: string;
  label: string;
  desc: string;
  changes: string;   // 만들 때마다 바뀌는 것
  keeps: string;     // 바뀌지 않는 것
  when: string;      // 언제 고르면 좋은지
}
export const FREEDOMS: FreedomChoice[] = [
  {
    key: "safe",
    icon: "ph:shield-check-duotone",
    label: "안정적으로",
    desc: "무난하고 예상되는 그림",
    changes: "바뀌는 것이 없어요. 적어 주신 내용만 가지고 그대로 그립니다.",
    keeps: "그림 배치도, 밝기도, 그림 그리는 방식도 매번 똑같아요.",
    when: "마음에 든 그림과 같은 느낌으로 계속 만들고 싶을 때 고르세요. 대신 여러 번 만들어도 거의 같은 그림이 나옵니다.",
  },
  {
    key: "normal",
    icon: "ph:sliders-duotone",
    label: "적당히 다르게",
    desc: "추천 · 구도와 조명이 매번 바뀜",
    changes: "그림을 어디에 놓을지 6가지, 빛을 어떻게 비출지 5가지 중에서 만들 때마다 하나씩 골라 씁니다. (예: 이번엔 왼쪽에 크게·노을빛, 다음엔 비스듬한 배치·환한 빛)",
    keeps: "그림을 그리는 방식(사진 같은지, 그림 같은지)은 그대로예요.",
    when: "여러 장 만들어 보고 마음에 드는 것을 고르고 싶을 때 좋아요.",
  },
  {
    key: "wild",
    icon: "ph:sparkle-duotone",
    label: "매번 새롭게",
    desc: "그림체까지 과감하게 바뀜",
    changes: "위의 배치·빛에 더해, 그림 그리는 방식 6가지까지 매번 바꿉니다. (예: 이번엔 사진처럼, 다음엔 색연필 그림처럼, 그 다음엔 색종이 오려 붙인 것처럼)",
    keeps: "적어 주신 글자와 업종만 그대로 지켜요.",
    when: "새로운 아이디어를 폭넓게 보고 싶을 때 좋아요. 대신 만들 때마다 분위기가 많이 달라집니다.",
  },
];

/**
 * 생성 요청마다 붙일 변주 문구. 같은 입력이라도 매번 다른 그림이 나오게 한다.
 * 이미지 API에는 seed·temperature가 없어서, 프롬프트를 흔드는 것이 유일한 수단이다.
 */
export function variationHint(freedom: Freedom): string {
  if (freedom === "safe") return "";
  const base = ` 이번 그림은 ${pick(COMPOSITIONS)}로, ${pick(LIGHTINGS)} 아래 그려줘.`;
  if (freedom === "normal") return base;
  return `${base} 그림체는 ${pick(STYLES)}으로 하고, 흔한 구성 대신 과감하고 새로운 시안으로 만들어줘.`;
}

// 자유도는 세션 동안 유지 — 다시 만들 때마다 고르지 않아도 되게.
const FREEDOM_KEY = "ai_create.freedom";

export function getFreedom(): Freedom {
  try {
    const v = sessionStorage.getItem(FREEDOM_KEY);
    if (v === "safe" || v === "normal" || v === "wild") return v;
  } catch {
    /* 접근 불가 시 기본값 */
  }
  return "normal";
}

export function setFreedom(v: Freedom): void {
  try {
    sessionStorage.setItem(FREEDOM_KEY, v);
  } catch {
    /* 저장 실패는 무시 */
  }
}

export interface Estimate {
  quality: string;
  estimated_cost_krw: number;
  remaining_krw: number | null;
  remaining_images: number | null;
}

export async function fetchEstimate(w: number, h: number, quality: string): Promise<Estimate> {
  const { data } = await api.get<Estimate>("/api/usage/estimate", {
    params: { width: w, height: h, quality },
  });
  return data;
}

export interface GenerateResult {
  generation_id: string;
  project_id: string;
  project_name: string;
  page_id: string;
  image_url: string;
  thumb_url: string;
  size: string;
  cost_krw: number;
  remaining_krw: number | null;
}

export interface GeneratePayload {
  prompt: string;
  width: number;
  height: number;
  quality: string;
  mode: "ai_text" | "layer";
  text_content?: string;
  name?: string;          // 사용자가 정한 제목
  kind?: "banner" | "flyer";
  template_id?: string;   // 있으면 기존 프로젝트 이미지 갱신(편집기 AI 수정)
  ref_generation_id?: string;
  ref_upload_id?: string;
  similarity?: number; // 1~4
}

// AI 문구 추천 (업종/행사 → 후보 3~5개 + 비용/잔액)
export interface CopyResult {
  candidates: string[];
  cost_krw: number;
  remaining_krw: number | null;
}
export async function copywrite(business: string, event: string, tone = "밝고 친근하게"): Promise<CopyResult> {
  const { data } = await api.post<CopyResult>("/api/copywrite", { business, event, tone });
  return data;
}

// 참고용 사진 업로드 → ref_upload_id 반환
export async function uploadRef(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<{ ref_upload_id: string }>("/api/refs/upload", fd);
  return data.ref_upload_id;
}

export async function generate(p: GeneratePayload): Promise<GenerateResult> {
  const { data } = await api.post<GenerateResult>("/api/generate", {
    ...p,
    unit: "px",
    dpi: 300,
  });
  return data;
}

export function krw(n: number | null | undefined): string {
  if (n === null || n === undefined) return "무제한";
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

export type Unit = "px" | "mm" | "cm";
export const MAX_PX = 3840; // 백엔드 SIZE_MAX 와 동일

// 단위 값을 px로 환산 (mm/cm는 DPI 기준). 백엔드 to_px 와 동일 규칙.
export function toPx(value: number, unit: Unit, dpi = 300): number {
  if (unit === "px") return Math.round(value);
  if (unit === "mm") return Math.round((value * dpi) / 25.4);
  return Math.round((value * 10 * dpi) / 25.4); // cm
}

// ───────── 최근 입력한 설명 재사용 (localStorage, 최대 20개) ─────────
const RECENT_PROMPTS_KEY = "ai_create.recent_prompts";
const RECENT_PROMPTS_MAX = 20;

export function getRecentPrompts(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_PROMPTS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecentPrompt(text: string): void {
  const t = text.trim();
  if (!t) return;
  const next = [t, ...getRecentPrompts().filter((p) => p !== t)].slice(0, RECENT_PROMPTS_MAX);
  try {
    localStorage.setItem(RECENT_PROMPTS_KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패는 무시 */
  }
}

// ───────── 최근 생성 이미지 목록 (참고 이미지 선택·다운로드용) ─────────
export interface RecentGen {
  id: string;
  template_id: string | null;
  prompt: string;
  size: string;
  thumb_url: string;
  image_url: string | null;
}

export async function listGenerations(): Promise<RecentGen[]> {
  const { data } = await api.get<{ items: RecentGen[] }>("/api/generations");
  return data.items;
}

// ───────── 이미지 내려받기 (PNG/JPG) ─────────
function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export async function downloadImage(url: string, format: "png" | "jpg", name = "홍보물"): Promise<void> {
  const blob = await (await fetch(url)).blob();
  let out = blob;
  if (format === "jpg") {
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0);
    out = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.9));
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(out);
  a.download = `${name}_${todayStamp()}.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}
