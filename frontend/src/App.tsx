import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import Login from "./pages/Login";
import Studio from "./pages/Studio";
import Home from "./pages/Home";
import Admin from "./pages/Admin";
import Editor from "./pages/Editor";
import Library from "./pages/Library";
import type { ReactNode } from "react";

function Loading() {
  return <div className="min-h-screen grid place-items-center text-slate-400">불러오는 중...</div>;
}

function Protected({ children, adminOnly }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

// 로그인 라우트: 이미 로그인돼 있으면 홈으로 (로그인 성공 시 자동 이동)
function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/" element={<Protected><Home /></Protected>} />
          <Route path="/studio" element={<Protected><Studio /></Protected>} />
          <Route path="/editor" element={<Protected><Editor /></Protected>} />
          <Route path="/library" element={<Protected><Library /></Protected>} />
          <Route path="/admin" element={<Protected adminOnly><Admin /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
