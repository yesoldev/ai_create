// 새 버전 알림 — 탭을 오래 열어 두면 배포 후에도 예전 화면으로 돈다.
// 몇 분마다(그리고 창으로 돌아올 때) 서버의 index.html을 확인해, 화면 파일이 바뀌었으면 새로고침을 권한다.
import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { useJobs } from "../lib/jobs";

const CHECK_MS = 5 * 60_000;

/** html 안의 첫 모듈 스크립트 주소(빌드마다 이름에 해시가 바뀐다) */
function entryOf(html: string): string | null {
  return html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)?.[1] ?? null;
}

function currentEntry(): string | null {
  return document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute("src") ?? null;
}

// 개발 서버에선 끈다(E2E는 window.__FORCE_UPDATE_CHECK__ 로 켠다)
const enabled = () =>
  import.meta.env.PROD || (window as unknown as { __FORCE_UPDATE_CHECK__?: boolean }).__FORCE_UPDATE_CHECK__ === true;

export default function UpdateNotice() {
  const [outdated, setOutdated] = useState(false);
  const { jobs } = useJobs();
  const running = jobs.some((j) => j.status === "running");

  useEffect(() => {
    if (!enabled()) return;
    const mine = currentEntry();
    if (!mine) return;
    let stop = false;
    async function check() {
      if (stop || document.hidden) return;
      try {
        const r = await fetch(`/index.html?v=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const latest = entryOf(await r.text());
        if (latest && latest !== mine) setOutdated(true);
      } catch {
        /* 오프라인 등 — 다음에 다시 */
      }
    }
    const t = setInterval(check, CHECK_MS);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    check();
    return () => {
      stop = true;
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  if (!outdated) return null;
  return (
    <div role="alert" className="jobs-bar-in border-b-2 border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/50">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <Icon icon="ph:arrow-circle-up-duotone" className="shrink-0 text-[28px] text-sky-600" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-sky-900 dark:text-sky-100">새 버전이 나왔어요</p>
          <p className="text-base text-sky-800/90 dark:text-sky-200/90">
            {running
              ? "지금 만드는 그림이 끝난 뒤에 새로고침해 주세요. (새로고침하면 만들던 그림 표시가 끊겨요)"
              : "새로고침하면 바로 적용돼요."}
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          disabled={running}
          className="flex h-12 items-center gap-1.5 rounded-2xl bg-sky-600 px-5 text-lg font-bold text-white hover:bg-sky-500 disabled:opacity-50"
        >
          <Icon icon="ph:arrow-clockwise-bold" /> 지금 새로고침
        </button>
      </div>
    </div>
  );
}
