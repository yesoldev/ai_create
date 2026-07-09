import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, getToken, getRefresh, setToken, setRefresh, setSession } from "./api";

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "user";
  monthly_limit_krw: number | null;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadMe() {
    // 토큰이 없어도 refresh_token 있으면 인터셉터가 자동 갱신 시도
    if (!getToken() && !getRefresh()) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get<User>("/api/auth/me");
      setUser(data);
    } catch {
      setToken(null);
      setRefresh(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function login(email: string, password: string) {
    const { data } = await api.post("/api/auth/login", { email, password });
    setSession(data.access_token, data.refresh_token ?? null);
    const me = await api.get<User>("/api/auth/me");
    setUser(me.data);
  }

  function logout() {
    setSession(null, null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
