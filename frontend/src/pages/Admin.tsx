import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { listUsers, createUser, patchUser, type AdminUser } from "../lib/admin";
import { krw } from "../lib/studio";

export default function Admin() {
  const nav = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [ym, setYm] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const d = await listUsers();
    setUsers(d.items);
    setYm(d.year_month);
  }
  useEffect(() => {
    load().catch(() => setMsg("목록을 불러오지 못했습니다."));
  }, []);

  const total = users.reduce((s, u) => s + Number(u.used_krw || 0), 0);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white">
            <Icon icon="ph:gear-duotone" className="text-[20px]" />
          </span>
          관리자
        </div>
        <button onClick={() => nav("/")} className="flex h-11 items-center gap-1 rounded-xl px-3 text-base text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          <Icon icon="ph:house-duotone" /> 홈으로
        </button>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">계정 관리</h1>
            <p className="mt-1 text-lg text-neutral-500 dark:text-neutral-400">
              {ym} · 이번 달 전체 사용액 <b>{krw(total)}</b>
            </p>
          </div>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="flex h-12 items-center gap-2 rounded-2xl bg-emerald-600 px-5 text-lg font-bold text-white hover:bg-emerald-500"
          >
            <Icon icon="ph:user-plus-bold" /> 계정 추가
          </button>
        </div>

        {msg && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{msg}</p>}

        {showAdd && (
          <AddUserForm
            onDone={async (m) => {
              setShowAdd(false);
              setMsg(m);
              await load();
            }}
            onError={setMsg}
          />
        )}

        <div className="mt-6 space-y-3">
          {users.map((u) => (
            <UserRow key={u.id} u={u} onChange={load} onError={setMsg} />
          ))}
        </div>
      </main>
    </div>
  );
}

function AddUserForm({
  onDone,
  onError,
}: {
  onDone: (msg: string) => void;
  onError: (m: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("15000");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createUser({
        email,
        password: pw,
        name: name || undefined,
        monthly_limit_krw: limit ? Number(limit) : null,
      });
      onDone(`${email} 계정을 만들었습니다.`);
    } catch {
      onError("계정 생성에 실패했습니다. 이미 있는 이메일인지 확인하세요.");
    } finally {
      setBusy(false);
    }
  }

  const field = "h-12 w-full rounded-xl border-2 border-neutral-200 bg-white px-4 text-lg outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-5 sm:grid-cols-2 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <label className="block">
        <span className="mb-1 block font-semibold">이메일</span>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="name@company.com" />
      </label>
      <label className="block">
        <span className="mb-1 block font-semibold">임시 비밀번호</span>
        <input type="text" required value={pw} onChange={(e) => setPw(e.target.value)} className={field} placeholder="6자 이상" />
      </label>
      <label className="block">
        <span className="mb-1 block font-semibold">이름</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="홍길동" />
      </label>
      <label className="block">
        <span className="mb-1 block font-semibold">월 한도(원)</span>
        <input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} className={field} placeholder="15000" />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className="flex h-12 items-center gap-2 rounded-xl bg-emerald-600 px-6 text-lg font-bold text-white hover:bg-emerald-500 disabled:opacity-50">
          <Icon icon="ph:check-bold" /> {busy ? "만드는 중..." : "만들기"}
        </button>
      </div>
    </form>
  );
}

function UserRow({ u, onChange, onError }: { u: AdminUser; onChange: () => Promise<void>; onError: (m: string) => void }) {
  const [limit, setLimit] = useState(u.monthly_limit_krw?.toString() ?? "");
  const [busy, setBusy] = useState(false);

  async function act(body: Parameters<typeof patchUser>[1], ok?: string) {
    setBusy(true);
    try {
      await patchUser(u.id, body);
      await onChange();
      if (ok) onError(ok);
    } catch {
      onError("변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const unlimited = u.monthly_limit_krw === null;

  return (
    <div className="rounded-2xl border-2 border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold">
            {u.name || u.email}
            {u.role === "admin" && (
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-sm text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">관리자</span>
            )}
            {!u.is_active && <span className="rounded-md bg-neutral-200 px-2 py-0.5 text-sm text-neutral-600 dark:bg-neutral-700">사용 중지</span>}
          </div>
          <div className="text-base text-neutral-500 dark:text-neutral-400">{u.email}</div>
          <div className="mt-1 text-base">
            사용 {krw(u.used_krw)} / 한도 {unlimited ? "무제한" : krw(u.monthly_limit_krw)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={busy}
            onClick={() => act({ is_active: !u.is_active }, u.is_active ? "사용을 중지했습니다." : "다시 사용하도록 했습니다.")}
            className="flex h-11 items-center gap-1 rounded-xl border-2 border-neutral-200 px-3 text-base hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            <Icon icon={u.is_active ? "ph:pause-bold" : "ph:play-bold"} />
            {u.is_active ? "사용 중지" : "다시 사용"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
        <span className="text-base text-neutral-500">월 한도 변경:</span>
        <input
          type="number"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          disabled={unlimited}
          className="h-10 w-32 rounded-lg border-2 border-neutral-200 px-3 text-base disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900"
          placeholder="원"
        />
        <button
          disabled={busy || unlimited || !limit}
          onClick={() => act({ monthly_limit_krw: Number(limit) }, "한도를 바꿨습니다.")}
          className="h-10 rounded-lg bg-emerald-600 px-3 text-base font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          저장
        </button>
        <button
          disabled={busy}
          onClick={() =>
            act(
              unlimited ? { monthly_limit_krw: 15000 } : { unlimited: true },
              unlimited ? "기본 한도(15,000원)로 설정했습니다." : "무제한으로 바꿨습니다.",
            )
          }
          className="h-10 rounded-lg border-2 border-neutral-200 px-3 text-base hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          {unlimited ? "한도 다시 설정" : "무제한으로"}
        </button>
      </div>
    </div>
  );
}
