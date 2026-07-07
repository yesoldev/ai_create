import { useState, type FormEvent } from "react";
import { Icon } from "@iconify/react";
import { useAuth } from "../lib/auth";

// 은은한 그레인(노이즈) 오버레이 — 브랜드 패널 질감용
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

const REASSURE = [
  { icon: "ph:image-square-duotone", text: "배너·전단지를 골라서 만들어요" },
  { icon: "ph:copy-duotone", text: "한번 만든 건 저장해 다시 써요" },
  { icon: "ph:printer-duotone", text: "완성하면 바로 인쇄할 수 있어요" },
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(email, pw);
      // 성공 시 화면 이동은 /login 라우트가 user 상태를 보고 자동 처리(App.tsx).
      // busy 유지 → 리다이렉트 전까지 버튼은 확인중 상태.
    } catch {
      setErr("이메일 또는 비밀번호가 올바르지 않습니다. 다시 확인해 주세요.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 lg:grid lg:grid-cols-[1.04fr_0.96fr]">
      {/* ───────── 좌측 브랜드 패널 (데스크톱) ───────── */}
      <aside className="relative hidden overflow-hidden bg-emerald-800 lg:flex lg:flex-col lg:justify-between lg:p-14 dark:bg-emerald-950">
        {/* 오로라 블롭 */}
        <div className="pointer-events-none absolute inset-0">
          <div className="drift absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-emerald-400/40 blur-3xl" />
          <div
            className="drift absolute -bottom-32 right-[-6rem] h-[30rem] w-[30rem] rounded-full bg-teal-300/30 blur-3xl"
            style={{ animationDelay: "-6s" }}
          />
          <div
            className="drift absolute right-24 top-16 h-64 w-64 rounded-full bg-amber-300/25 blur-3xl"
            style={{ animationDelay: "-11s" }}
          />
        </div>
        {/* 점 그리드 + 그레인 */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 mix-blend-soft-light opacity-40"
          style={{ backgroundImage: GRAIN }}
        />

        {/* 상단 워드마크 */}
        <div className="rise relative flex items-center gap-3 text-white">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <Icon icon="ph:paint-brush-broad-duotone" className="text-[26px]" />
          </span>
          <span className="text-xl font-semibold tracking-tight">홍보물 만들기</span>
        </div>

        {/* 중앙 카피 */}
        <div className="rise relative text-white" style={{ animationDelay: "0.08s" }}>
          <h1 className="text-[2.9rem] font-bold leading-[1.18] tracking-tight">
            누구나 몇 번의 손길로
            <br />
            <span className="text-amber-200">멋진 배너와 전단지</span>를
            <br />
            만들 수 있어요
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-emerald-50/85">
            복잡한 프로그램 없이, 화면이 안내하는 대로 따라가면 됩니다.
          </p>
        </div>

        {/* 하단 안심 문구 */}
        <ul className="rise relative space-y-4" style={{ animationDelay: "0.16s" }}>
          {REASSURE.map((r) => (
            <li key={r.text} className="flex items-center gap-4 text-emerald-50">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/12 ring-1 ring-white/20">
                <Icon icon={r.icon} className="text-[24px]" />
              </span>
              <span className="text-lg">{r.text}</span>
            </li>
          ))}
        </ul>
      </aside>

      {/* ───────── 우측 로그인 폼 ───────── */}
      <main className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10 lg:min-h-0">
        <div className="w-full max-w-md">
          {/* 모바일 상단 로고 */}
          <div className="rise mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-600 text-white">
              <Icon icon="ph:paint-brush-broad-duotone" className="text-[26px]" />
            </span>
            <span className="text-xl font-semibold tracking-tight">홍보물 만들기</span>
          </div>

          <div className="rise" style={{ animationDelay: "0.06s" }}>
            <h2 className="text-[2.1rem] font-bold tracking-tight">로그인</h2>
            <p className="mt-2 text-lg text-neutral-500 dark:text-neutral-400">
              회사에서 만들어 준 계정으로 들어오세요.
            </p>
          </div>

          <form
            onSubmit={onSubmit}
            className="rise mt-9 space-y-6"
            style={{ animationDelay: "0.12s" }}
            noValidate
          >
            {/* 이메일 */}
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-lg font-semibold text-neutral-800 dark:text-neutral-200"
              >
                이메일
              </label>
              <div className="relative">
                <Icon
                  icon="ph:envelope-simple-duotone"
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[24px] text-neutral-400"
                />
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  aria-invalid={!!err}
                  aria-describedby={err ? "login-error" : undefined}
                  className="h-14 w-full rounded-2xl border-2 border-neutral-200 bg-neutral-50 pl-13 pr-4 text-lg outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/15 dark:border-neutral-800 dark:bg-neutral-900 dark:focus:bg-neutral-900"
                  required
                />
              </div>
            </div>

            {/* 비밀번호 */}
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-lg font-semibold text-neutral-800 dark:text-neutral-200"
              >
                비밀번호
              </label>
              <div className="relative">
                <Icon
                  icon="ph:lock-key-duotone"
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[24px] text-neutral-400"
                />
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="비밀번호 입력"
                  aria-invalid={!!err}
                  aria-describedby={err ? "login-error" : undefined}
                  className="h-14 w-full rounded-2xl border-2 border-neutral-200 bg-neutral-50 pl-13 pr-14 text-lg outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/15 dark:border-neutral-800 dark:bg-neutral-900 dark:focus:bg-neutral-900"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"}
                  className="absolute right-1.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-neutral-800"
                >
                  <Icon
                    icon={showPw ? "ph:eye-slash-duotone" : "ph:eye-duotone"}
                    className="text-[24px]"
                  />
                </button>
              </div>
            </div>

            {/* 오류 메시지 */}
            {err && (
              <div
                id="login-error"
                role="alert"
                className="flex items-start gap-3 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
              >
                <Icon
                  icon="ph:warning-circle-fill"
                  className="mt-0.5 shrink-0 text-[22px]"
                />
                <span className="text-base leading-snug">{err}</span>
              </div>
            )}

            {/* 로그인 버튼 */}
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-xl font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/30 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Icon icon="ph:spinner-gap-bold" className="animate-spin text-[24px]" />
                  확인하는 중...
                </>
              ) : (
                <>
                  로그인
                  <Icon
                    icon="ph:arrow-right-bold"
                    className="text-[22px] transition-transform group-hover:translate-x-1"
                  />
                </>
              )}
            </button>
          </form>

          {/* 안내 (가입 없음) */}
          <p className="rise mt-8 flex items-center justify-center gap-2 text-center text-base text-neutral-600 dark:text-neutral-400" style={{ animationDelay: "0.2s" }}>
            <Icon icon="ph:info-duotone" className="text-[20px]" />
            비밀번호를 모르면 관리자에게 문의하세요.
          </p>
        </div>
      </main>
    </div>
  );
}
