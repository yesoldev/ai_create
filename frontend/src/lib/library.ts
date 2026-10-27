import { api } from "./api";

export interface TemplateListItem {
  id: string;
  name: string;
  size_w: number | null;
  size_h: number | null;
  thumb_url?: string;
  updated_at: string;
}

export interface TemplatePage {
  id: string | null; // 구 데이터 안전망은 null
  sort_order: number;
  canvas_json: Record<string, unknown> | null;
  bg_url?: string | null;
  thumb_url?: string;
}

export interface TemplateDetail {
  id: string;
  name: string;
  canvas_json: Record<string, unknown> | null;
  size_w: number | null;
  size_h: number | null;
  folder_id?: string | null;
  bg_url?: string | null;
  thumb_url?: string;
  pages?: TemplatePage[];
}

/** 프로젝트를 편집기로 열 때 넘기는 상태 — 홈·보관함·작업 패널이 똑같이 연다 */
export function editorStateOf(t: TemplateDetail) {
  return {
    imageUrl: t.bg_url || undefined,
    w: t.size_w || 1024,
    h: t.size_h || 1024,
    canvasJson: t.canvas_json || undefined,
    templateName: t.name,
    templateId: t.id,
    folderId: t.folder_id ?? "",
    pages: t.pages,
  };
}

export async function listTemplates(folderId?: string | null): Promise<TemplateListItem[]> {
  const params = folderId ? { folder_id: folderId } : {};
  return (await api.get<{ items: TemplateListItem[] }>("/api/templates", { params })).data.items;
}

export async function getTemplate(id: string): Promise<TemplateDetail> {
  return (await api.get<TemplateDetail>(`/api/templates/${id}`)).data;
}

export async function saveTemplate(body: {
  name: string;
  canvas_json: Record<string, unknown>;
  size_w: number;
  size_h: number;
  generation_id?: string;
  folder_id?: string | null;
}): Promise<{ id: string }> {
  return (await api.post("/api/templates", body)).data;
}

export async function updateTemplate(
  id: string,
  body: { name?: string; canvas_json?: Record<string, unknown>; folder_id?: string | null; move_to_root?: boolean },
): Promise<void> {
  await api.patch(`/api/templates/${id}`, body);
}

export async function deleteTemplate(id: string): Promise<void> {
  await api.delete(`/api/templates/${id}`);
}

export interface UploadResult {
  project_id: string;
  page_id: string;
  name: string;
  size_w: number;
  size_h: number;
  image_url: string;
  thumb_url: string;
}

// 이미지 파일을 올려 새 프로젝트로 만들기 (AI 생성 없음)
export async function uploadProject(file: File, folderId?: string | null): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("file", file);
  if (folderId) fd.append("folder_id", folderId);
  return (await api.post<UploadResult>("/api/templates/upload", fd)).data;
}

// 페이지별 오버레이(canvas_json) 일괄 저장
export async function savePages(
  templateId: string,
  pages: { id: string; canvas_json: Record<string, unknown> }[],
): Promise<void> {
  await api.put(`/api/templates/${templateId}/pages`, { pages });
}

export interface PageImageResult {
  page_id: string;
  sort_order: number;
  size_w: number;
  size_h: number;
  image_url: string;
  thumb_url: string;
}

// 이미지를 새 페이지로 추가(편집기 자르기 결과) — AI 생성 없음(무과금)
export async function addPageImage(templateId: string, blob: Blob): Promise<PageImageResult> {
  const fd = new FormData();
  fd.append("file", new File([blob], "page.png", { type: "image/png" }));
  return (await api.post<PageImageResult>(`/api/templates/${templateId}/pages/image`, fd)).data;
}

export async function deletePage(templateId: string, pageId: string): Promise<void> {
  await api.delete(`/api/templates/${templateId}/pages/${pageId}`);
}
