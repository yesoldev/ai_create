// 관리자 조언용 — 직원이 만든 그림 모아보기(팝업) + 한 장 자세히 보기(팝업).
// 나이 많은 직원들이 무엇을 어떻게 입력했는지 보고 조언해 주려는 용도.
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { useDismiss } from "./dialogs";
import { listUserWorks, getWork, type WorkItem, type WorkDetail } from "../lib/admin";
import { IMAGE_MODELS, krw } from "../lib/studio";

const QUALITY_LABEL: Record<string, string> = { low: "빠르게", medium: "보통", high: "고급" };

function fmtDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  if (!withTime) return date;
  return `${d.getFullYear()}년 ${date} ${d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}`;
}

function modelLabel(m: string | null): string {
  if (!m) return "-";
  return IMAGE_MODELS.find((x) => x.key === m)?.label ?? m;
}

/** 목록 카드의 한 줄 요약 — 설명 또는 AI 수정 요청 */
function summary(w: WorkItem): string {
  const pick = w.inputs.find((i) => i.label === "설명" || i.label === "AI 수정 요청") ?? w.inputs[0];
  return pick?.value.replace(/\s+/g, " ") ?? "";
}

/** 팝업 1 — 직원이 만든 그림 모아보기 */
export function WorkGallery({
  userId,
  userName,
  onClose,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const dismiss = useDismiss(onClose);

  // 자세히 보기가 열려 있으면 Esc는 그쪽만 닫는다
  const closeTop = useCallback(() => (openIdx === null ? onClose() : setOpenIdx(null)), [openIdx, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeTop();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeTop]);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      try {
        const d = await listUserWorks(userId, offset);
        setItems((prev) => (offset === 0 ? d.items : [...prev, ...d.items]));
        setHasMore(d.has_more);
      } catch {
        setErr("목록을 불러오지 못했어요. 잠시 후 다시 열어 주세요.");
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );
  useEffect(() => {
    load(0);
  }, [load]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-neutral-950/50 p-3 sm:p-6" {...dismiss}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${userName}님이 만든 홍보물`}
        className="rise flex w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-neutral-900"
      >
        <header className="flex items-start justify-between gap-4 border-b-2 border-neutral-100 px-6 py-5 dark:border-neutral-800">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold">
              <Icon icon="ph:images-square-duotone" className="text-[30px] text-emerald-600" />
              {userName}님이 만든 홍보물
            </h2>
            <p className="mt-1 text-base text-neutral-500 dark:text-neutral-400">
              그림을 누르면 직원이 입력한 내용을 크게 볼 수 있어요. 최신순이에요.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl border-2 border-neutral-200 px-4 text-lg font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            <Icon icon="ph:x-bold" /> 닫기
          </button>
        </header>

        <div className="flex-1 overflow-y-auto bg-neutral-50 px-6 py-6 dark:bg-neutral-950/40">
          {err && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-lg text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{err}</p>
          )}
          {!loading && !err && items.length === 0 && (
            <div className="grid place-items-center py-24 text-center text-neutral-500">
              <Icon icon="ph:image-broken-duotone" className="text-[56px] text-neutral-300" />
              <p className="mt-3 text-xl font-semibold">아직 만든 홍보물이 없어요</p>
            </div>
          )}
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((w, i) => (
              <li key={w.id} className="rise" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                <button
                  onClick={() => setOpenIdx(i)}
                  className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border-2 border-neutral-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-lg focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <span className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                    <Thumb src={w.thumb_url} />
                    {w.inputs.some((x) => x.label === "AI 수정 요청") && (
                      <span className="absolute left-2 top-2 rounded-full bg-neutral-900/75 px-2.5 py-1 text-sm font-semibold text-white">
                        AI로 수정
                      </span>
                    )}
                  </span>
                  <span className="flex flex-1 flex-col gap-1 p-3">
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{fmtDate(w.created_at)}</span>
                    <span className="line-clamp-1 text-lg font-bold">{w.project_name || "제목 없음"}</span>
                    <span className="line-clamp-2 text-base text-neutral-500 dark:text-neutral-400">
                      {summary(w) || "입력 내용 없음"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {loading && <p className="py-8 text-center text-lg text-neutral-500">불러오는 중...</p>}
          {hasMore && !loading && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => load(items.length)}
                className="flex h-12 items-center gap-2 rounded-2xl border-2 border-neutral-200 bg-white px-6 text-lg font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
              >
                <Icon icon="ph:caret-down-bold" /> 더 보기
              </button>
            </div>
          )}
        </div>
      </div>

      {openIdx !== null && items[openIdx] && (
        <WorkDetailDialog
          key={items[openIdx].id}
          id={items[openIdx].id}
          pos={`${openIdx + 1} / ${items.length}${hasMore ? "+" : ""}`}
          onPrev={openIdx > 0 ? () => setOpenIdx(openIdx - 1) : undefined}
          onNext={openIdx < items.length - 1 ? () => setOpenIdx(openIdx + 1) : undefined}
          onClose={() => setOpenIdx(null)}
        />
      )}
    </div>
  );
}

function Thumb({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (broken)
    return <Icon icon="ph:image-duotone" className="text-[44px] text-neutral-300 dark:text-neutral-600" aria-label="미리보기 없음" />;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.03]"
    />
  );
}

/** 팝업 2 — 한 장 자세히 보기(큰 그림 + 직원 입력 + 설정 + AI 전체 문장) */
function WorkDetailDialog({
  id,
  pos,
  onPrev,
  onNext,
  onClose,
}: {
  id: string;
  pos: string;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<WorkDetail | null>(null);
  const [err, setErr] = useState("");
  const dismiss = useDismiss(onClose);

  useEffect(() => {
    getWork(id)
      .then(setD)
      .catch(() => setErr("내용을 불러오지 못했어요."));
  }, [id]);

  // 좌우 화살표로 이전/다음 작품
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);

  const navBtn =
    "flex h-12 items-center gap-1.5 rounded-2xl border-2 border-neutral-200 px-4 text-lg font-semibold hover:bg-neutral-100 disabled:opacity-30 dark:border-neutral-700 dark:hover:bg-neutral-800";

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-neutral-950/60 p-3 sm:p-6" {...dismiss}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="홍보물 자세히 보기"
        className="rise flex w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-neutral-900"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-neutral-100 px-5 py-4 dark:border-neutral-800">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{d ? fmtDate(d.created_at, true) : " "}</p>
            <h3 className="truncate text-2xl font-bold">{d?.project_name || "제목 없음"}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onPrev} disabled={!onPrev} className={navBtn} aria-label="이전 작품">
              <Icon icon="ph:caret-left-bold" /> 이전
            </button>
            <span className="min-w-16 text-center text-base tabular-nums text-neutral-500">{pos}</span>
            <button onClick={onNext} disabled={!onNext} className={navBtn} aria-label="다음 작품">
              다음 <Icon icon="ph:caret-right-bold" />
            </button>
            <button onClick={onClose} className={`${navBtn} ml-1`}>
              <Icon icon="ph:x-bold" /> 닫기
            </button>
          </div>
        </header>

        <div className="grid flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:overflow-hidden">
          {/* 큰 그림 */}
          <div className="grid min-h-[280px] place-items-center bg-neutral-100 p-4 dark:bg-neutral-950 lg:overflow-auto">
            {err ? (
              <p className="text-lg text-amber-700">{err}</p>
            ) : !d ? (
              <p className="text-lg text-neutral-500">불러오는 중...</p>
            ) : d.image_url ? (
              <a href={d.image_url} target="_blank" rel="noreferrer" title="새 창에서 원본 크기로 보기" className="block">
                <img
                  src={d.image_url}
                  alt={d.project_name || "생성된 홍보물"}
                  className="max-h-[70vh] w-auto rounded-lg shadow-xl ring-1 ring-black/5"
                />
              </a>
            ) : (
              <p className="text-lg text-neutral-500">그림 파일을 찾을 수 없어요</p>
            )}
          </div>

          {/* 직원이 입력한 내용 */}
          {d && (
            <div className="flex flex-col gap-5 p-5 lg:overflow-y-auto">
              <section>
                <h4 className="flex items-center gap-2 text-xl font-bold">
                  <Icon icon="ph:note-pencil-duotone" className="text-[26px] text-emerald-600" />
                  직원이 입력한 내용
                </h4>
                {!d.inputs_recorded && (
                  <p className="mt-2 rounded-xl bg-neutral-100 px-3 py-2 text-base text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    예전 기록이라, AI에 보낸 문장에서 입력 내용을 뽑아 보여드려요.
                  </p>
                )}
                {d.inputs.length === 0 ? (
                  <p className="mt-3 text-lg text-neutral-500">입력한 내용이 없어요.</p>
                ) : (
                  <dl className="mt-3 overflow-hidden rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                    {d.inputs.map((it, i) => (
                      <div key={i} className="border-b border-emerald-100 px-4 py-3 last:border-b-0 dark:border-emerald-900/40">
                        <dt className="text-sm font-bold text-emerald-800 dark:text-emerald-300">{it.label}</dt>
                        <dd className="mt-0.5 whitespace-pre-wrap break-words text-lg leading-relaxed">{it.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>

              <section>
                <h4 className="mb-2 text-lg font-bold">설정</h4>
                <div className="flex flex-wrap gap-2">
                  <Chip icon="ph:sparkle-duotone" text={`품질 ${QUALITY_LABEL[d.quality ?? ""] ?? d.quality ?? "-"}`} />
                  <Chip icon="ph:frame-corners-duotone" text={d.size ? d.size.replace("x", " × ") : "-"} />
                  <Chip icon="ph:cpu-duotone" text={modelLabel(d.model)} />
                  <Chip icon="ph:coins-duotone" text={krw(Number(d.cost_krw))} />
                  {d.has_ref && <Chip icon="ph:images-duotone" text="참고 이미지 사용" />}
                </div>
              </section>

              <details className="group rounded-2xl border-2 border-neutral-200 dark:border-neutral-800">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-base font-semibold text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/60">
                  <span className="flex items-center gap-2">
                    <Icon icon="ph:code-duotone" className="text-[22px]" />
                    AI에 실제로 보낸 전체 문장
                  </span>
                  <Icon icon="ph:caret-down-bold" className="transition group-open:rotate-180" />
                </summary>
                <p className="whitespace-pre-wrap break-words border-t-2 border-neutral-100 px-4 py-3 text-sm leading-relaxed text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
                  {d.prompt || "-"}
                </p>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-100 px-3 py-2 text-base font-medium dark:bg-neutral-800">
      <Icon icon={icon} className="text-[20px] text-neutral-500" />
      {text}
    </span>
  );
}
