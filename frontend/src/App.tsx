import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { JobsProvider } from "./lib/jobs";
import JobsUI from "./components/JobsUI";
import UpdateNotice from "./components/UpdateNotice";
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

// 편집기는 열 때마다(작업 패널 '바로가기'로 같은 주소에서 다른 프로젝트를 열 때도) 새로 그린다
function EditorRoute() {
  const loc = useLocation();
  return <Editor key={loc.key} />;
}

// AI 작업 알림 바·패널 — 로그인한 화면에서만
function JobsLayer() {
  const { user } = useAuth();
  return user ? <JobsUI /> : null;
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
      <JobsProvider>
      <BrowserRouter>
        <UpdateNotice />
        <JobsLayer />
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/" element={<Protected><Home /></Protected>} />
          <Route path="/studio" element={<Protected><Studio /></Protected>} />
          <Route path="/editor" element={<Protected><EditorRoute /></Protected>} />
          <Route path="/library" element={<Protected><Library /></Protected>} />
          <Route path="/admin" element={<Protected adminOnly><Admin /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </JobsProvider>
    </AuthProvider>
  );
}
