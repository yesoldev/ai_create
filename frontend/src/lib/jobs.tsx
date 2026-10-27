// 백그라운드 AI 작업 관리 — 생성 요청을 화면과 떼어 앱 전체에서 관리한다.
// 페이지를 옮겨도 요청은 계속되고, 상단 알림 바·오른쪽 패널(JobsUI)이 진행 상황을 보여준다.
// (새로고침/창 닫기 시 브라우저 요청은 끊기지만 서버는 끝까지 만들어 보관함에 저장한다)
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { errorInfo, isSafetyBlocked, SAFETY_FAIL_MSG, type GenerateResult } from "./studio";

export type JobStatus = "running" | "done" | "error";

export interface Job {
  id: string;
  kind: "new" | "edit"; // 새 홍보물 / 편집기 'AI로 수정'
  title: string;
  startedAt: number;
  finishedAt?: number;
  status: JobStatus;
  note?: string; // 진행 중 안내(안전 검사 재시도 등)
  error?: string;
  result?: GenerateResult;
  templateId?: string; // 편집 대상 프로젝트(edit) — 결과 프로젝트는 result.project_id
  consumed?: boolean; // 편집기가 결과를 이미 새 페이지로 붙였는지
}

export type JobOutcome = { ok: true; result: GenerateResult } | { ok: false; error: string };

interface StartOptions {
  kind: Job["kind"];
  title: string;
  templateId?: string;
  /** 실제 작업. setNote로 진행 안내를 바꿀 수 있다. */
  run: (setNote: (note: string) => void) => Promise<GenerateResult>;
}

interface JobsCtx {
  jobs: Job[];
  start: (o: StartOptions) => Promise<JobOutcome>;
  consume: (id: string) => void;
  retry: (id: string) => void; // 실패한 작업을 같은 내용으로 다시
  dismissFinished: () => void; // 완료·실패한 작업을 목록에서 지운다
  barHidden: boolean;
  hideBar: () => void;
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
  doneTick: number; // 작업이 성공적으로 끝날 때마다 +1 — 목록 화면이 다시 불러오는 신호
}

const Ctx = createContext<JobsCtx | null>(null);

/** 한 장 만드는 데 걸리는 대략 시간(진행 막대 표시용) */
export const EXPECTED_MS = 40_000;

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [barHidden, setBarHidden] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [doneTick, setDoneTick] = useState(0);
  const seq = useRef(0);
  const optsOf = useRef(new Map<string, StartOptions>()); // 다시 시도용으로 작업 내용을 기억

  const patch = useCallback((id: string, p: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...p } : j)));
  }, []);

  const start = useCallback(
    async (o: StartOptions): Promise<JobOutcome> => {
      const id = `job-${Date.now()}-${seq.current++}`;
      optsOf.current.set(id, o);
      setJobs((prev) => [
        { id, kind: o.kind, title: o.title, templateId: o.templateId, startedAt: Date.now(), status: "running" },
        ...prev,
      ]);
      setBarHidden(false);
      try {
        const result = await o.run((note) => patch(id, { note }));
        optsOf.current.delete(id); // 성공한 작업은 다시 시도할 일이 없다
        patch(id, { status: "done", result, note: undefined, finishedAt: Date.now() });
        setDoneTick((t) => t + 1);
        setBarHidden(false); // 끝났다는 걸 다시 보여준다
        return { ok: true, result };
      } catch (e) {
        const error = isSafetyBlocked(e) ? SAFETY_FAIL_MSG : errorInfo(e).message;
        patch(id, { status: "error", error, note: undefined, finishedAt: Date.now() });
        setBarHidden(false);
        return { ok: false, error };
      }
    },
    [patch],
  );

  const consume = useCallback((id: string) => patch(id, { consumed: true }), [patch]);

  const retry = useCallback(
    (id: string) => {
      const o = optsOf.current.get(id);
      if (!o) return;
      optsOf.current.delete(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      void start(o);
    },
    [start],
  );

  // 끝난 작업을 목록에서 지운다(다시 시도용 기억도 함께)
  const dismissFinished = useCallback(() => {
    setJobs((prev) => {
      for (const j of prev) if (j.status !== "running") optsOf.current.delete(j.id);
      return prev.filter((j) => j.status === "running");
    });
  }, []);

  const hideBar = useCallback(() => {
    dismissFinished();
    setBarHidden(true);
  }, [dismissFinished]);

  // 진행 중인 작업이 있으면 새로고침·창 닫기 전에 한 번 묻는다
  const running = jobs.some((j) => j.status === "running");
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);

  const value = useMemo(
    () => ({ jobs, start, consume, retry, dismissFinished, barHidden, hideBar, panelOpen, setPanelOpen, doneTick }),
    [jobs, start, consume, retry, dismissFinished, barHidden, hideBar, panelOpen, doneTick],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useJobs() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useJobs must be used within JobsProvider");
  return ctx;
}

/** 1초마다 다시 그려 경과 시간·진행 막대를 움직인다(진행 중일 때만) */
export function useTicker(active: boolean) {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setT((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
}

/** 진행 중 작업의 대략 진행률(0~95%). 실제 진행률은 알 수 없어 경과 시간으로 추정한다. */
export function estimatePct(j: Job): number {
  if (j.status !== "running") return 100;
  const r = (Date.now() - j.startedAt) / EXPECTED_MS;
  // 처음엔 빠르게, 예상 시간을 넘기면 천천히 95%에 다가간다
  return Math.min(95, Math.round(r < 1 ? r * 85 : 85 + (1 - Math.exp(-(r - 1))) * 10));
}

export function elapsedText(j: Job): string {
  const s = Math.max(0, Math.round(((j.finishedAt ?? Date.now()) - j.startedAt) / 1000));
  return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`;
}
