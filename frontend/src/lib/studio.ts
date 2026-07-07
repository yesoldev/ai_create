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
    { key: "banner_wide", label: "가로 배너", w: 1024, h: 400, hint: "홈페이지·현수막 느낌" },
    { key: "banner_square", label: "정사각 배너", w: 1024, h: 1024, hint: "SNS 게시물" },
  ],
  flyer: [
    { key: "flyer_a4_300", label: "전단지 A4 (인쇄용)", w: 2480, h: 3508, hint: "300DPI · 인쇄소 표준" },
    { key: "flyer_sample", label: "전단지 (보통)", w: 1773, h: 3189, hint: "화면·간단 인쇄" },
  ],
};

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
