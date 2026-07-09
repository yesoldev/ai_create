import axios from "axios";

// 개발: vite 프록시(/api → localhost:8000). 배포: 백엔드가 프론트까지 서빙하므로 상대경로.
export const api = axios.create({ baseURL: "" });

const TOKEN_KEY = "ac_token";
const REFRESH_KEY = "ac_refresh";

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setRefresh(token: string | null) {
  if (token) localStorage.setItem(REFRESH_KEY, token);
  else localStorage.removeItem(REFRESH_KEY);
}

export function getRefresh(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

/** 로그인/갱신 결과 저장 (둘 다 관리) */
export function setSession(access: string | null, refresh?: string | null) {
  setToken(access);
  if (refresh !== undefined) setRefresh(refresh);
}

api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

// access_token 만료(401) 시 refresh_token 으로 자동 갱신 후 원요청 재시도
let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const rt = getRefresh();
  if (!rt) return null;
  try {
    // 인터셉터 재귀를 피하려고 raw axios 사용
    const { data } = await axios.post("/api/auth/refresh", { refresh_token: rt });
    setToken(data.access_token);
    if (data.refresh_token) setRefresh(data.refresh_token);
    return data.access_token as string;
  } catch {
    setToken(null);
    setRefresh(null);
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const orig = error.config;
    const status = error.response?.status;
    const isAuthCall = typeof orig?.url === "string" && orig.url.includes("/api/auth/");
    if (status === 401 && orig && !orig._retried && !isAuthCall && getRefresh()) {
      orig._retried = true;
      if (!refreshing) refreshing = doRefresh().finally(() => (refreshing = null));
      const newToken = await refreshing;
      if (newToken) {
        orig.headers = orig.headers || {};
        orig.headers.Authorization = `Bearer ${newToken}`;
        return api(orig);
      }
    }
    return Promise.reject(error);
  },
);
