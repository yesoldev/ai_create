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
