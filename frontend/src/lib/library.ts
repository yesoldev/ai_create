import { api } from "./api";

export interface TemplateListItem {
  id: string;
  name: string;
  size_w: number | null;
  size_h: number | null;
  thumb_url?: string;
  updated_at: string;
}

export interface TemplateDetail {
  id: string;
  name: string;
  canvas_json: Record<string, unknown> | null;
  size_w: number | null;
  size_h: number | null;
  bg_url?: string | null;
  thumb_url?: string;
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

export async function deleteTemplate(id: string): Promise<void> {
  await api.delete(`/api/templates/${id}`);
}
