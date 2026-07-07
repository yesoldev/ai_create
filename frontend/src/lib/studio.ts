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
export const QUICK_STARTS: QuickStart[] = [
  { key: "job", icon: "ph:briefcase-duotone", label: "구인 공고", description: "직원 채용 안내, 신뢰감 있고 깔끔한 배경, 모집 부문·근무조건·연락처가 잘 보이게" },
  { key: "sale", icon: "ph:tag-duotone", label: "할인 행사", description: "할인 행사 안내, 밝고 눈에 잘 띄는 배경, 활기찬 분위기" },
  { key: "open", icon: "ph:storefront-duotone", label: "새 개업", description: "새로 문을 연 가게 개업 안내, 축하하는 밝은 분위기, 화사한 배경" },
  { key: "recruit", icon: "ph:users-three-duotone", label: "회원 모집", description: "회원 모집 안내, 믿음이 가는 깔끔한 배경, 따뜻한 느낌" },
  { key: "event", icon: "ph:calendar-check-duotone", label: "행사 안내", description: "행사 일정과 장소 안내, 정돈되고 읽기 쉬운 배경" },
  { key: "notice", icon: "ph:megaphone-duotone", label: "안내문", description: "이용 안내문, 차분하고 깔끔한 배경, 글자가 잘 보이게" },
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

// 신문 지면 광고 맥락 — 프롬프트에 항상 덧붙임
export const NEWSPAPER_HINT =
  "신문 지면에 실릴 광고 이미지. 인쇄에 적합하게 깔끔하고 선명하며 글자가 또렷하게 보이도록.";

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
