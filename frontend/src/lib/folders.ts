import { api } from "./api";

export interface Folder {
  id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
}

export async function listFolders(): Promise<Folder[]> {
  return (await api.get<{ items: Folder[] }>("/api/folders/tree")).data.items;
}

export async function createFolder(name: string, parent_id?: string | null): Promise<Folder> {
  return (await api.post<Folder>("/api/folders", { name, parent_id: parent_id ?? null })).data;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await api.patch(`/api/folders/${id}`, { name });
}

export async function deleteFolder(id: string, force = false): Promise<void> {
  await api.delete(`/api/folders/${id}`, { params: force ? { force: true } : {} });
}

// 평면 목록 → 깊이 계산(들여쓰기용)
export function withDepth(folders: Folder[]): (Folder & { depth: number })[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const depthOf = (f: Folder): number => {
    let d = 0;
    let cur = f.parent_id ? byId.get(f.parent_id) : undefined;
    while (cur) {
      d += 1;
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return d;
  };
  return folders.map((f) => ({ ...f, depth: depthOf(f) }));
}
