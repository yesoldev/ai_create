import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { api } from "../lib/api";
import { krw, downloadImage } from "../lib/studio";
import { useAuth } from "../lib/auth";
import { listTemplates, getTemplate, type TemplateListItem } from "../lib/library";
import { useDismiss } from "../components/dialogs";

interface Usage {
  monthly_limit_krw: number | null;
  used_krw: number;
  remaining_krw: number | null;
}
interface Gen {
  id: string;
  template_id: string | null;
  prompt: string;
  size: string;
  thumb_url: string;
  image_url: string | null;
}

export default function Home() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [projects, setProjects] = useState<TemplateListItem[]>([]);
  const [gens, setGens] = useState<Gen[]>([]);
  const [opening, setOpening] = useState(false);
  const [picked, setPicked] = useState<Gen | null>(null); // 최근 만든 것 클릭 시 다운로드/편집
  const pickedDismiss = useDismiss(() => setPicked(null));

  useEffect(() => {
    api.get<Usage>("/api/usage/me").then((r) => setUsage(r.data)).catch(() => {});
    listTemplates().then(setProjects).catch(() => {});
    api.get<{ items: Gen[] }>("/api/generations").then((r) => setGens(r.data.items)).catch(() => {});
  }, []);

  async function openProject(templateId: string) {
    if (opening) return;
    setOpening(true);
    try {
      const t = await getTemplate(templateId);
      nav("/editor", {
        state: {
          imageUrl: t.bg_url || undefined,
          w: t.size_w || 1024,
          h: t.size_h || 1024,
          canvasJson: t.canvas_json || undefined,
          templateName: t.name,
          templateId: t.id,
          folderId: t.folder_id ?? "",
          pages: t.pages,
        },
      });
    } finally {
      setOpening(false);
    }
  }

  async function handleDownload(g: Gen, format: "png" | "jpg") {
    if (!g.image_url) return;
    try {
      await downloadImage(g.image_url, format, g.prompt?.slice(0, 16) || "홍보물");
    } catch {
      alert("내려받기에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  // 한 프로젝트의 여러 페이지가 각각 카드로 나오지 않도록 프로젝트(template_id)별 최신 1개만
  const recentUnique = (() => {
    const seen = new Set<string>();
    return gens.filter((g) => {
      if (!g.template_id) return true;
      if (seen.has(g.template_id)) return false;
      seen.add(g.template_id);
      return true;
    });
  })();

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
          <button onClick={() => nav("/library")} className="flex h-11 items-center gap-1 rounded-xl px-3 text-base text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <Icon icon="ph:folders-duotone" /> 보관함
          </button>
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

      <main className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="text-3xl font-bold tracking-tight">안녕하세요, {user?.name || "회원"}님</h1>
        <p className="mt-2 text-lg text-neutral-500 dark:text-neutral-400">오늘도 멋진 홍보물을 만들어 보세요.</p>

        {/* 1) 새 홍보물 만들기 (맨 위) */}
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

        {/* 2) 이번 달 남은 금액 */}
        <div className="mt-6 rounded-3xl border-2 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Icon icon="ph:wallet-duotone" className="text-emerald-500 text-[24px]" />
            이번 달 남은 금액
          </div>
          {usage && (
            <>
              <p className="mt-2 text-3xl font-bold">{usage.remaining_krw === null ? "제한 없음" : krw(usage.remaining_krw)}</p>
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

        {/* 3) 프로젝트 (횡스크롤) */}
        <Row
          title="내 프로젝트"
          icon="ph:cards-three-duotone"
          onMore={() => nav("/library")}
          empty="아직 프로젝트가 없어요. 위에서 새로 만들어 보세요."
          items={projects.map((p) => ({
            id: p.id,
            name: p.name,
            sub: `${p.size_w}×${p.size_h}`,
            thumb: p.thumb_url,
            onClick: () => openProject(p.id),
          }))}
        />

        {/* 4) 최근 만든 것 (횡스크롤) — 클릭 시 다운로드/편집 */}
        <Row
          title="최근 만든 것"
          icon="ph:clock-counter-clockwise-duotone"
          empty="아직 만든 홍보물이 없어요."
          items={recentUnique.map((g) => ({
            id: g.id,
            name: g.prompt?.slice(0, 16) || "홍보물",
            sub: g.size,
            thumb: g.thumb_url,
            onClick: () => setPicked(g),
          }))}
        />
      </main>

      {/* 최근 만든 것 클릭 → 다운로드/편집 모달 (#5) */}
      {picked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...pickedDismiss}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-neutral-900 rise">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Icon icon="ph:image-duotone" className="text-emerald-600 text-[26px]" />
                이 홍보물
              </h2>
              <button onClick={() => setPicked(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                <Icon icon="ph:x-bold" className="text-[20px]" />
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl border-2 border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
              <img src={picked.image_url || picked.thumb_url} alt={picked.prompt?.slice(0, 16) || "홍보물"} className="mx-auto max-h-[45vh] w-auto" />
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                onClick={() => handleDownload(picked, "png")}
                disabled={!picked.image_url}
                className="flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 px-5 text-lg font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                <Icon icon="ph:download-simple-bold" /> PNG 내려받기
              </button>
              <button
                onClick={() => handleDownload(picked, "jpg")}
                disabled={!picked.image_url}
                className="flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-emerald-100 px-5 text-lg font-bold text-emerald-800 transition hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-900/40 dark:text-emerald-200"
              >
                <Icon icon="ph:download-simple-bold" /> JPG 내려받기
              </button>
            </div>
            {picked.template_id && (
              <button
                onClick={() => {
                  const id = picked.template_id!;
                  setPicked(null);
                  openProject(id);
                }}
                className="mt-2 flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-neutral-200 px-5 text-lg font-bold text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                <Icon icon="ph:pencil-simple-bold" /> 글자 수정 또는 추가
              </button>
            )}
            <p className="mt-3 text-center text-base text-neutral-500 dark:text-neutral-400">
              PNG는 배경이 비칠 수 있어요 · JPG는 파일이 작아요
            </p>
          </div>
        </div>
      )}

      {opening && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30">
          <Icon icon="ph:spinner-gap-bold" className="animate-spin text-5xl text-emerald-500" />
        </div>
      )}
    </div>
  );
}

interface RowItem {
  id: string;
  name: string;
  sub: string;
  thumb?: string;
  onClick?: () => void;
}

function Row({
  title,
  icon,
  items,
  empty,
  onMore,
}: {
  title: string;
  icon: string;
  items: RowItem[];
  empty: string;
  onMore?: () => void;
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <Icon icon={icon} className="text-emerald-600" /> {title}
        </h2>
        {onMore && (
          <button onClick={onMore} className="flex items-center gap-1 text-base text-emerald-700 hover:underline dark:text-emerald-300">
            모두 보기 <Icon icon="ph:arrow-right-bold" />
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-neutral-300 p-8 text-center text-base text-neutral-400 dark:border-neutral-700">
          {empty}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={it.onClick}
              disabled={!it.onClick}
              className="w-40 shrink-0 overflow-hidden rounded-2xl border-2 border-neutral-200 bg-white text-left transition hover:border-emerald-400 disabled:hover:border-neutral-200 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="aspect-square bg-neutral-100 dark:bg-neutral-800">
                {it.thumb ? (
                  <img src={it.thumb} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid h-full place-items-center text-neutral-300"><Icon icon="ph:image-duotone" className="text-3xl" /></div>
                )}
              </div>
              <p className="truncate px-2.5 pt-2 text-sm font-semibold">{it.name}</p>
              <p className="px-2.5 pb-2 text-xs text-neutral-400">{it.sub}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
