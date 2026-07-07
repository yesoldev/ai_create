import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { api } from "../lib/api";
import { krw } from "../lib/studio";
import { useAuth } from "../lib/auth";

interface Usage {
  monthly_limit_krw: number | null;
  used_krw: number;
  remaining_krw: number | null;
}
interface Gen {
  id: string;
  prompt: string;
  size: string;
  cost_krw: number;
  thumb_url: string;
  created_at: string;
}

export default function Home() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [gens, setGens] = useState<Gen[]>([]);

  useEffect(() => {
    api.get<Usage>("/api/usage/me").then((r) => setUsage(r.data)).catch(() => {});
    api.get<{ items: Gen[] }>("/api/generations").then((r) => setGens(r.data.items)).catch(() => {});
  }, []);

  const pct =
    usage && usage.monthly_limit_krw
      ? Math.min(100, Math.round((usage.used_krw / usage.monthly_limit_krw) * 100))
      : 0;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white">
            <Icon icon="ph:paint-brush-broad-duotone" className="text-[20px]" />
          </span>
          홍보물 만들기
        </div>
        <div className="flex items-center gap-1">
          {user?.role === "admin" && (
            <button onClick={() => nav("/admin")} className="flex h-11 items-center gap-1 rounded-xl px-3 text-base text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              <Icon icon="ph:gear-duotone" /> 관리자
            </button>
          )}
          <button onClick={logout} className="flex h-11 items-center gap-1 rounded-xl px-3 text-base text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <Icon icon="ph:sign-out-duotone" /> 나가기
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="text-3xl font-bold tracking-tight">
          안녕하세요, {user?.name || "회원"}님
        </h1>
        <p className="mt-2 text-lg text-neutral-500 dark:text-neutral-400">오늘도 멋진 홍보물을 만들어 보세요.</p>

        {/* 큰 만들기 버튼 */}
        <button
          onClick={() => nav("/studio")}
          className="mt-6 flex w-full items-center gap-4 rounded-3xl bg-emerald-600 p-6 text-left text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-500 active:scale-[0.995]"
        >
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/15">
            <Icon icon="ph:magic-wand-duotone" className="text-[36px]" />
          </span>
          <span>
            <span className="block text-2xl font-bold">새 홍보물 만들기</span>
            <span className="block text-lg text-emerald-50/90">배너·전단지를 몇 번의 클릭으로</span>
          </span>
          <Icon icon="ph:arrow-right-bold" className="ml-auto text-[28px]" />
        </button>

        {/* 잔여 한도 */}
        <div className="mt-6 rounded-3xl border-2 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Icon icon="ph:wallet-duotone" className="text-emerald-500 text-[24px]" />
            이번 달 남은 금액
          </div>
          {usage && (
            <>
              <p className="mt-2 text-3xl font-bold">
                {usage.remaining_krw === null ? "제한 없음" : krw(usage.remaining_krw)}
              </p>
              {usage.monthly_limit_krw !== null && (
                <>
                  <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-2 text-base text-neutral-500 dark:text-neutral-400">
                    {krw(usage.used_krw)} 사용 / {krw(usage.monthly_limit_krw)} 한도
                  </p>
                </>
              )}
            </>
          )}
        </div>

        {/* 최근 작업 */}
        <h2 className="mt-10 text-2xl font-bold">최근 만든 것</h2>
        {gens.length === 0 ? (
          <div className="mt-4 rounded-3xl border-2 border-dashed border-neutral-300 p-12 text-center text-lg text-neutral-400 dark:border-neutral-700">
            아직 만든 홍보물이 없어요. 위 버튼으로 시작해 보세요.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {gens.map((g) => (
              <div key={g.id} className="overflow-hidden rounded-2xl border-2 border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                <img src={g.thumb_url} alt={g.prompt} className="aspect-square w-full object-cover" loading="lazy" />
                <p className="truncate px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400">{g.size}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
