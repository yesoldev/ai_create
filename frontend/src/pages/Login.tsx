// [임시 배선용] 세련된 로그인 UI는 /frontend-design-merged 스킬로 교체 예정
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(email, pw);
      nav("/");
    } catch {
      setErr("이메일 또는 비밀번호가 올바르지 않습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md bg-white rounded-2xl shadow p-8 space-y-5"
      >
        <div className="flex items-center gap-2 text-2xl font-bold text-slate-800">
          <Icon icon="ph:paint-brush-broad-bold" className="text-indigo-600" />
          홍보물 만들기
        </div>
        <label className="block">
          <span className="text-lg text-slate-700">이메일</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full h-12 px-4 text-lg border rounded-lg"
            required
          />
        </label>
        <label className="block">
          <span className="text-lg text-slate-700">비밀번호</span>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="mt-1 w-full h-12 px-4 text-lg border rounded-lg"
            required
          />
        </label>
        {err && <p className="text-red-600">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full h-14 text-xl font-bold text-white bg-indigo-600 rounded-lg disabled:opacity-50"
        >
          {busy ? "확인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}
