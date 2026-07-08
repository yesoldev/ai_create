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
    { key: "flyer_a4_300", label: "전단지 A4 (인쇄용)", w: 2480, h: 3508, hint: "300DPI · 인쇄소 표준" },
    { key: "flyer_sample", label: "전단지 (보통)", w: 1773, h: 3189, hint: "화면·간단 인쇄" },
  ],
};

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
  "글자는 최소한으로만 넣고 나머지는 그림과 여백으로 채워, 한눈에 들어오게 만들어줘.";

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
  ref_generation_id?: string;
  ref_upload_id?: string;
  similarity?: number; // 1~4
}

// AI 문구 추천 (업종/행사 → 후보 3~5개)
export async function copywrite(business: string, event: string, tone = "밝고 친근하게"): Promise<string[]> {
  const { data } = await api.post<{ candidates: string[] }>("/api/copywrite", { business, event, tone });
  return data.candidates;
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
