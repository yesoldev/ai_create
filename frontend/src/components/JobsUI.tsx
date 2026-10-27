// 백그라운드 AI 작업 화면 — 상단 진행 알림 바 + 오른쪽 슬라이드 패널 + 가운데 확대 팝업.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { useJobs, useTicker, estimatePct, elapsedText, type Job } from "../lib/jobs";
import { getTemplate, editorStateOf } from "../lib/library";
import { useDismiss } from "./dialogs";

/** 결과 프로젝트를 보관함에서 고른 것처럼 편집기로 연다 */
function useOpenProject() {
  const nav = useNavigate();
  const { setPanelOpen } = useJobs();
  const [opening, setOpening] = useState<string | null>(null);
  async function open(projectId: string) {
    if (opening) return;
    setOpening(projectId);
    try {
      const t = await getTemplate(projectId);
      setPanelOpen(false);
      nav("/editor", { state: editorStateOf(t) });
    } catch {
      alert("프로젝트를 열지 못했어요. 보관함에서 다시 찾아 주세요.");
    } finally {
      setOpening(null);
    }
  }
  return { open, opening };
}

export default function JobsUI() {
  const { jobs, barHidden, hideBar, panelOpen, setPanelOpen } = useJobs();
  const running = jobs.filter((j) => j.status === "running");
  useTicker(running.length > 0);

  const showBar = jobs.length > 0 && !barHidden;
  return (
    <>
      {showBar && <JobsBar jobs={jobs} onOpen={() => setPanelOpen(true)} onClose={hideBar} />}
      <JobsPanel open={panelOpen} jobs={jobs} onClose={() => setPanelOpen(false)} />
    </>
  );
}

// ───────── 상단 진행 알림 바 ─────────
function JobsBar({ jobs, onOpen, onClose }: { jobs: Job[]; onOpen: () => void; onClose: () => void }) {
  const running = jobs.filter((j) => j.status === "running").length;
  const done = jobs.filter((j) => j.status === "done").length;
  const failed = jobs.filter((j) => j.status === "error").length;
  const pct = Math.round(jobs.reduce((s, j) => s + estimatePct(j), 0) / jobs.length);

  const label = running
    ? `AI가 ${running}개 만드는 중${done ? ` · ${done}개 완성` : ""}${failed ? ` · ${failed}개 실패` : ""}`
    : done && failed
      ? `${done}개 완성 · ${failed}개 실패`
      : done
        ? `${done}개 완성됐어요`
        : `${failed}개 실패했어요`;
  const icon = running ? "ph:spinner-gap-bold" : failed && !done ? "ph:warning-circle-fill" : "ph:check-circle-fill";
  const tone = running
    ? "text-emerald-600"
    : failed && !done
      ? "text-red-600"
      : "text-emerald-600";

  // 화면 맨 위에 자리를 차지하는 띠(떠 있지 않음) — 페이지 머리글 버튼을 가리지 않는다
  return (
    <div
      role="status"
      aria-live="polite"
      className="jobs-bar-in relative z-40 border-b-2 border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-emerald-50 dark:border-emerald-900 dark:from-emerald-950/60 dark:via-neutral-900 dark:to-emerald-950/60"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-1 px-2 py-1.5 sm:px-4">
        <button
          onClick={onOpen}
          className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 text-left hover:bg-emerald-100/60 dark:hover:bg-emerald-900/30"
          aria-label={`${label} — 눌러서 자세히 보기`}
        >
          <Icon icon={icon} className={`shrink-0 text-[26px] ${tone} ${running ? "animate-spin" : ""}`} />
          <span className="truncate text-lg font-bold">{label}</span>
          <span className="ml-auto hidden h-2.5 w-40 shrink-0 overflow-hidden rounded-full bg-emerald-100 sm:block dark:bg-emerald-950">
            <span
              className="block h-full rounded-full bg-emerald-500 transition-[width] duration-1000 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="flex shrink-0 items-center gap-0.5 text-base font-semibold text-emerald-700 sm:ml-2 dark:text-emerald-300">
            보기 <Icon icon="ph:caret-right-bold" />
          </span>
        </button>
        <button
          onClick={onClose}
          aria-label="알림 닫기"
          title={running ? "닫아도 만들기는 계속돼요" : "닫기"}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <Icon icon="ph:x-bold" className="text-[20px]" />
        </button>
      </div>
    </div>
  );
}

// ───────── 오른쪽 슬라이드 패널 ─────────
function JobsPanel({ open, jobs, onClose }: { open: boolean; jobs: Job[]; onClose: () => void }) {
  const { dismissFinished, retry } = useJobs();
  const { open: openProject, opening } = useOpenProject();
  const [zoom, setZoom] = useState<Job | null>(null);
  const dismiss = useDismiss(onClose);
  const closeRef = useRef<HTMLButtonElement>(null);

  // 열리면 키보드 포커스를 패널 안(닫기 버튼)으로
  //  (숨김→보임 전환 직후엔 포커스가 안 먹어서, 한 번 그려진 다음에 준다)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => closeRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (zoom ? setZoom(null) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, zoom, onClose]);

  const finished = jobs.some((j) => j.status !== "running");

  return (
    <div
      className={`fixed inset-0 z-[80] transition-[visibility,background-color] duration-300 ${open ? "visible bg-neutral-950/30" : "invisible bg-transparent"}`}
      aria-hidden={!open}
      {...dismiss}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="AI 작업 목록"
        className={`absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl transition-transform duration-300 ease-out sm:w-[440px] dark:bg-neutral-900 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-start justify-between gap-3 border-b-2 border-neutral-100 px-5 py-4 dark:border-neutral-800">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold">
              <Icon icon="ph:magic-wand-duotone" className="text-[28px] text-emerald-600" />
              AI 작업
            </h2>
            <p className="mt-1 text-base text-neutral-500 dark:text-neutral-400">
              만드는 동안 다른 일을 하셔도 돼요.
            </p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl border-2 border-neutral-200 px-4 text-lg font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            <Icon icon="ph:x-bold" /> 닫기
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {jobs.length === 0 ? (
            <div className="grid place-items-center py-20 text-center text-neutral-500">
              <Icon icon="ph:tray-duotone" className="text-[52px] text-neutral-300" />
              <p className="mt-3 text-lg font-semibold">진행 중인 작업이 없어요</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {jobs.map((j) => (
                <JobCard key={j.id} j={j} opening={opening} onOpen={openProject} onZoom={() => setZoom(j)} onRetry={() => retry(j.id)} />
              ))}
            </ul>
          )}
        </div>

        {finished && (
          <footer className="border-t-2 border-neutral-100 px-4 py-3 dark:border-neutral-800">
            <button
              onClick={dismissFinished}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <Icon icon="ph:broom-duotone" className="text-[22px]" /> 끝난 작업 목록에서 지우기
            </button>
          </footer>
        )}
      </aside>

      {zoom?.result && (
        <ZoomDialog
          job={zoom}
          opening={opening === zoom.result.project_id}
          onOpen={() => openProject(zoom.result!.project_id)}
          onClose={() => setZoom(null)}
        />
      )}
    </div>
  );
}

function kindLabel(j: Job) {
  return j.kind === "edit" ? "AI로 수정" : "새 홍보물";
}

function JobCard({
  j,
  opening,
  onOpen,
  onZoom,
  onRetry,
}: {
  j: Job;
  opening: string | null;
  onOpen: (projectId: string) => void;
  onZoom: () => void;
  onRetry: () => void;
}) {
  if (j.status === "running") {
    const pct = estimatePct(j);
    return (
      <li className="rise rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
        <div className="flex gap-3">
          <div className="jobs-shimmer grid h-24 w-24 shrink-0 place-items-center rounded-xl bg-emerald-100 dark:bg-emerald-950">
            <Icon icon="ph:spinner-gap-bold" className="animate-spin text-[34px] text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{kindLabel(j)}</p>
            <p className="line-clamp-1 text-lg font-bold">{j.title}</p>
            <p className="text-base text-neutral-600 dark:text-neutral-400">
              만드는 중 · {elapsedText(j)} <span className="text-neutral-400">(보통 30초쯤)</span>
            </p>
            <div
              className="mt-2 h-2.5 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="진행도"
            >
              <span
                className="block h-full rounded-full bg-emerald-500 transition-[width] duration-1000 ease-linear"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
        {j.note && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-base font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            <Icon icon="ph:arrow-clockwise-bold" className="mt-0.5 shrink-0 animate-spin" />
            {j.note}
          </p>
        )}
      </li>
    );
  }

  if (j.status === "error") {
    return (
      <li className="rise rounded-2xl border-2 border-red-200 bg-red-50/60 p-4 dark:border-red-900/60 dark:bg-red-950/30">
        <p className="text-sm font-bold text-red-700 dark:text-red-400">{kindLabel(j)} · 실패</p>
        <p className="line-clamp-1 text-lg font-bold">{j.title}</p>
        <p className="mt-1 flex items-start gap-2 text-base text-red-700 dark:text-red-300">
          <Icon icon="ph:warning-circle-fill" className="mt-1 shrink-0" />
          {j.error}
        </p>
        <button
          onClick={onRetry}
          className="mt-3 flex h-12 items-center gap-1.5 rounded-2xl bg-white px-4 text-lg font-bold text-red-700 ring-2 ring-red-200 hover:bg-red-100 dark:bg-neutral-900 dark:text-red-300 dark:ring-red-900"
        >
          <Icon icon="ph:arrow-clockwise-bold" /> 같은 내용으로 다시 만들기
        </button>
      </li>
    );
  }

  const r = j.result!;
  const [w, h] = r.size.split("x").map(Number);
  return (
    <li className="rise overflow-hidden rounded-2xl border-2 border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="group relative grid max-h-64 place-items-center overflow-hidden bg-neutral-100 dark:bg-neutral-950">
        <img
          src={r.thumb_url || r.image_url}
          onError={(e) => {
            if (e.currentTarget.src !== r.image_url) e.currentTarget.src = r.image_url; // 썸네일이 없으면 원본
          }}
          alt={`${j.title} 완성 그림`}
          loading="lazy"
          className="max-h-64 w-full object-contain"
          style={w && h ? { aspectRatio: `${w} / ${h}` } : undefined}
        />
        <button
          onClick={onZoom}
          aria-label="크게 보기"
          className="absolute inset-0 grid place-items-center bg-neutral-950/0 opacity-0 transition group-hover:bg-neutral-950/35 group-hover:opacity-100 focus-visible:bg-neutral-950/35 focus-visible:opacity-100 focus-visible:outline-none pointer-coarse:bg-neutral-950/15 pointer-coarse:opacity-100"
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-white text-neutral-900 shadow-xl transition group-hover:scale-100 scale-90">
            <Icon icon="ph:magnifying-glass-plus-bold" className="text-[30px]" />
          </span>
        </button>
      </div>
      <div className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
            {kindLabel(j)} · 완성 ({elapsedText(j)})
          </p>
          <p className="line-clamp-1 text-lg font-bold">{j.title}</p>
        </div>
        <button
          onClick={() => onOpen(r.project_id)}
          disabled={opening === r.project_id}
          className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-emerald-600 px-4 text-lg font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          <Icon icon={opening === r.project_id ? "ph:spinner-gap-bold" : "ph:arrow-square-out-bold"} className={opening === r.project_id ? "animate-spin" : ""} />
          바로가기
        </button>
      </div>
    </li>
  );
}

// ───────── 가운데 확대 팝업 ─────────
function ZoomDialog({
  job,
  opening,
  onOpen,
  onClose,
}: {
  job: Job;
  opening: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const dismiss = useDismiss(onClose);
  const r = job.result!;
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-neutral-950/70 p-4" {...dismiss}>
      <div role="dialog" aria-modal="true" aria-label="크게 보기" className="rise flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-neutral-900">
        <div className="grid min-h-0 flex-1 place-items-center bg-neutral-100 p-4 dark:bg-neutral-950">
          <img src={r.image_url} alt={`${job.title} 크게 보기`} className="max-h-[72vh] w-auto rounded-lg shadow-lg" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{kindLabel(job)}</p>
            <p className="truncate text-xl font-bold">{job.title}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onOpen}
              disabled={opening}
              className="flex h-12 items-center gap-1.5 rounded-2xl bg-emerald-600 px-5 text-lg font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              <Icon icon={opening ? "ph:spinner-gap-bold" : "ph:arrow-square-out-bold"} className={opening ? "animate-spin" : ""} />
              바로가기
            </button>
            <button
              onClick={onClose}
              className="flex h-12 items-center gap-1.5 rounded-2xl border-2 border-neutral-200 px-5 text-lg font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <Icon icon="ph:x-bold" /> 닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
