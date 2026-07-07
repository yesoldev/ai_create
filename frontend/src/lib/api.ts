import axios from "axios";

// 개발: vite 프록시(/api → localhost:8000). 배포: 백엔드가 프론트까지 서빙하므로 상대경로.
export const api = axios.create({ baseURL: "" });

const TOKEN_KEY = "ac_token";

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});
