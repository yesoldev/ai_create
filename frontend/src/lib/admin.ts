import { api } from "./api";

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "user";
  is_active: boolean;
  monthly_limit_krw: number | null;
  used_krw: number;
}

export async function listUsers(): Promise<{ year_month: string; items: AdminUser[] }> {
  return (await api.get("/api/admin/users")).data;
}

export async function createUser(body: {
  email: string;
  password: string;
  name?: string;
  role?: string;
  monthly_limit_krw?: number | null;
}): Promise<{ id: string; email: string }> {
  return (await api.post("/api/admin/users", body)).data;
}

export async function patchUser(
  id: string,
  body: {
    is_active?: boolean;
    monthly_limit_krw?: number;
    unlimited?: boolean;
    role?: string;
  },
): Promise<void> {
  await api.patch(`/api/admin/users/${id}`, body);
}

// ───────── 직원 작업 보기(관리자 조언용) ─────────
export interface InputItem {
  label: string;
  value: string;
}

export interface WorkItem {
  id: string;
  created_at: string;
  project_name: string | null;
  model: string | null;
  quality: string | null;
  size: string | null;
  cost_krw: number;
  has_ref: boolean;
  inputs: InputItem[];
  thumb_url: string;
}

export interface WorkDetail extends Omit<WorkItem, "thumb_url"> {
  inputs_recorded: boolean; // false = 예전 기록이라 AI 문장에서 뽑아낸 내용
  prompt: string | null;
  image_url: string | null;
}

export async function listUserWorks(
  uid: string,
  offset = 0,
): Promise<{ user: { id: string; email: string; name: string | null }; items: WorkItem[]; has_more: boolean }> {
  return (await api.get(`/api/admin/users/${uid}/generations`, { params: { offset, limit: 60 } })).data;
}

export async function getWork(gid: string): Promise<WorkDetail> {
  return (await api.get(`/api/admin/generations/${gid}`)).data;
}
