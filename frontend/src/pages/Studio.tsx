import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import {
  SIZES,
  MAX_PX,
  QUICK_STARTS,
  BUSINESS_TYPES,
  NEWSPAPER_HINT,
  toPx,
  fetchEstimate,
  generate,
  krw,
  type Estimate,
  type GenerateResult,
  type SizePreset,
  type Unit,
  type BizType,
} from "../lib/studio";

type Kind = "banner" | "flyer";
const QUALITIES = [
  { key: "low", label: "빠르게 (저렴)", desc: "연습·초안용" },
  { key: "medium", label: "보통 (추천)", desc: "대부분 이걸로 충분" },
  { key: "high", label: "고급 (선명)", desc: "인쇄·중요한 것" },
];

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

async function downloadImage(url: string, format: "png" | "jpg") {
  const blob = await (await fetch(url)).blob();
  let out = blob;
  if (format === "jpg") {
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0);
    out = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.9));
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(out);
  a.download = `홍보물_${today()}.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const STEP_LABELS = ["종류", "업종", "크기·품질", "문구", "만들기"];

export default function Studio() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<Kind | null>(null);
  const [biz, setBiz] = useState<BizType | null>(null);
  const [size, setSize] = useState<SizePreset | null>(null);
  // 직접 크기 입력
  const [custom, setCustom] = useState(false);
  const [cw, setCw] = useState(1024);
  const [ch, setCh] = useState(400);
  const [unit, setUnit] = useState<Unit>("px");
  const [quality, setQuality] = useState("medium");
  const [description, setDescription] = useState("");
  const [textContent, setTextContent] = useState("");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GenerateResult | null>(null);

  // 실제 생성 크기(px): 직접 입력이면 환산+상한, 아니면 프리셋
  const effW = custom ? Math.min(toPx(cw, unit), MAX_PX) : size?.w ?? 0;
  const effH = custom ? Math.min(toPx(ch, unit), MAX_PX) : size?.h ?? 0;

  // 크기·품질 바뀌면 예상비용/앞으로 N장 갱신
  useEffect(() => {
    if (!effW || !effH) return;
    let alive = true;
    fetchEstimate(effW, effH, quality)
      .then((e) => alive && setEstimate(e))
      .catch(() => alive && setEstimate(null));
    return () => {
      alive = false;
    };
  }, [effW, effH, quality]);

  const canNext = useMemo(() => {
    if (step === 1) return !!kind;
    if (step === 2) return !!biz;
    if (step === 3) return custom ? cw > 0 && ch > 0 : !!size;
    if (step === 4) return description.trim().length > 0;
    return true;
  }, [step, kind, biz, size, custom, cw, ch, description]);

  function pickKind(k: Kind) {
    setKind(k);
    setSize(SIZES[k][0]);
    setCustom(false);
    setStep(2);
  }

  function pickBiz(b: BizType) {
    setBiz(b);
    setStep(3);
  }

  async function onGenerate(refGenerationId?: string) {
    if (!effW || !effH) return;
    setBusy(true);
    setError("");
    try {
      const fullPrompt = `${biz ? `[업종: ${biz.label}] ` : ""}${description}. ${NEWSPAPER_HINT}`;
      const r = await generate({
        prompt: fullPrompt,
        width: effW,
        height: effH,
        quality,
        mode: "ai_text",
        text_content: textContent.trim() || undefined,
        ref_generation_id: refGenerationId,
        similarity: refGenerationId ? 2 : undefined,
      });
      setResult(r);
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setError(
        status === 402
          ? "이번 달 사용할 수 있는 금액을 넘었어요. 관리자에게 문의하세요."
          : "이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setResult(null);
    setStep(1);
    setKind(null);
    setBiz(null);
    setSize(null);
    setDescription("");
    setTextContent("");
  }

  // 마법사 도중 이탈 시 입력 손실 확인
  function guardedExit() {
    const hasProgress = !!kind || description.trim() || textContent.trim();
    if (hasProgress && !window.confirm("지금 나가면 입력한 내용이 사라져요. 나갈까요?")) return;
    nav("/");
  }

  async function handleDownload(url: string, format: "png" | "jpg") {
    try {
      await downloadImage(url, format);
    } catch {
      alert("내려받기에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  // ───────── 결과 화면 ─────────
  if (result) {
    return (
      <Shell onExit={() => nav("/")}>
        <div className="mx-auto max-w-3xl">
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Icon icon="ph:check-circle-duotone" className="text-emerald-500" />
            완성됐어요!
          </h1>
          <p className="mt-2 text-lg text-neutral-500 dark:text-neutral-400">
            아래에서 그림을 내려받으세요. 이번에 {krw(result.cost_krw)} 썼어요.
          </p>

          <div className="mt-6 overflow-hidden rounded-3xl border-2 border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
            <img src={result.image_url} alt="만든 홍보물" className="mx-auto max-h-[62vh] w-auto" />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <BigButton
              icon="ph:pencil-simple-bold"
              onClick={() =>
                nav("/editor", {
                  state: { imageUrl: result.image_url, w: effW, h: effH, generationId: result.generation_id },
                })
              }
            >
              글자 넣고 꾸미기
            </BigButton>
            <BigButton icon="ph:arrows-clockwise-bold" tone="soft" onClick={() => onGenerate(result.generation_id)}>
              비슷하게 다시 만들기
            </BigButton>
          </div>

          <p className="mt-6 mb-2 text-lg font-semibold">또는 바로 내려받기</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <BigButton icon="ph:download-simple-bold" tone="soft" onClick={() => handleDownload(result.image_url, "png")}>
              PNG로 내려받기
            </BigButton>
            <BigButton icon="ph:download-simple-bold" tone="ghost" onClick={() => handleDownload(result.image_url, "jpg")}>
              JPG로 내려받기
            </BigButton>
          </div>
          <p className="mt-3 text-center text-base text-neutral-500 dark:text-neutral-400">
            PNG는 배경이 비칠 수 있어요 · JPG는 파일이 작아요
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <BigButton icon="ph:arrow-counter-clockwise-bold" tone="soft" onClick={restart}>
              다른 홍보물 또 만들기
            </BigButton>
            <BigButton icon="ph:house-bold" tone="ghost" onClick={() => nav("/")}>
              처음으로
            </BigButton>
          </div>
        </div>
      </Shell>
    );
  }

  // ───────── 생성 중 ─────────
  if (busy) {
    return (
      <Shell onExit={() => nav("/")}>
        <div className="mx-auto flex max-w-lg flex-col items-center py-20 text-center">
          <Icon icon="ph:spinner-gap-bold" className="animate-spin text-6xl text-emerald-500" />
          <h1 className="mt-6 text-3xl font-bold">그림을 만들고 있어요</h1>
          <p className="mt-2 text-lg text-neutral-500 dark:text-neutral-400">
            30초쯤 걸려요. 잠시만 기다려 주세요.
          </p>
        </div>
      </Shell>
    );
  }

  // ───────── 마법사 ─────────
  return (
    <Shell onExit={guardedExit}>
      <Steps step={step} />
      <div className="mx-auto mt-8 max-w-3xl">
        {step === 1 && (
          <Section title="무엇을 만들까요?" desc="하나를 골라 주세요.">
            <div className="grid gap-4 sm:grid-cols-2">
              <ChoiceCard
                active={kind === "banner"}
                icon="ph:flag-banner-fold-duotone"
                title="배너"
                desc="가로로 긴 홍보 그림"
                onClick={() => pickKind("banner")}
              />
              <ChoiceCard
                active={kind === "flyer"}
                icon="ph:newspaper-clipping-duotone"
                title="전단지"
                desc="세로로 긴 안내지"
                onClick={() => pickKind("flyer")}
              />
            </div>
          </Section>
        )}

        {step === 2 && (
          <Section title="어떤 업종인가요?" desc="신문에 실릴 광고예요. 업종을 하나 골라 주세요.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {BUSINESS_TYPES.map((b) => (
                <ChoiceCard
                  key={b.key}
                  active={biz?.key === b.key}
                  icon={b.icon}
                  title={b.label}
                  desc=""
                  onClick={() => pickBiz(b)}
                />
              ))}
            </div>
          </Section>
        )}

        {step === 3 && kind && (
          <Section title="크기와 품질을 골라요" desc="잘 모르면 추천된 것을 그대로 두세요.">
            <p className="mb-2 text-lg font-semibold">크기</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {SIZES[kind].map((s) => (
                <ChoiceCard
                  key={s.key}
                  active={!custom && size?.key === s.key}
                  icon="ph:frame-corners-duotone"
                  title={s.label}
                  desc={`${s.hint} · ${s.w}×${s.h}`}
                  onClick={() => {
                    setCustom(false);
                    setSize(s);
                  }}
                />
              ))}
              <ChoiceCard
                active={custom}
                icon="ph:ruler-duotone"
                title="직접 크기 정하기"
                desc="원하는 가로·세로를 입력해요"
                onClick={() => setCustom(true)}
              />
            </div>

            {custom && (
              <div className="mt-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block">
                    <span className="mb-1 block text-base font-semibold">가로</span>
                    <input
                      type="number"
                      min={1}
                      value={cw}
                      onChange={(e) => setCw(Number(e.target.value))}
                      className="h-12 w-28 rounded-xl border-2 border-neutral-200 bg-white px-3 text-lg outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </label>
                  <span className="pb-3 text-lg text-neutral-400">×</span>
                  <label className="block">
                    <span className="mb-1 block text-base font-semibold">세로</span>
                    <input
                      type="number"
                      min={1}
                      value={ch}
                      onChange={(e) => setCh(Number(e.target.value))}
                      className="h-12 w-28 rounded-xl border-2 border-neutral-200 bg-white px-3 text-lg outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </label>
                  <div className="flex gap-1 pb-0.5">
                    {(["px", "mm", "cm"] as Unit[]).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setUnit(u)}
                        className={`h-12 w-14 rounded-xl text-lg font-semibold ${
                          unit === u
                            ? "bg-emerald-600 text-white"
                            : "border-2 border-neutral-200 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-3 text-base text-neutral-500 dark:text-neutral-400">
                  실제 그림 크기: <b>{effW}×{effH}</b> px
                  {unit !== "px" && " (300DPI 기준 환산)"}
                  {(toPx(cw, unit) > MAX_PX || toPx(ch, unit) > MAX_PX) && (
                    <span className="text-amber-600"> · 최대 {MAX_PX}px까지라 줄었어요</span>
                  )}
                </p>
              </div>
            )}

            <p className="mb-2 mt-6 text-lg font-semibold">품질</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {QUALITIES.map((q) => (
                <ChoiceCard
                  key={q.key}
                  active={quality === q.key}
                  icon="ph:sparkle-duotone"
                  title={q.label}
                  desc={q.desc}
                  onClick={() => setQuality(q.key)}
                />
              ))}
            </div>

            <EstimateBar estimate={estimate} />
          </Section>
        )}

        {step === 4 && (
          <Section title="어떤 그림을 원하세요?" desc="쉽게 설명만 적어 주세요.">
            <p className="mb-2 text-lg font-semibold">빠른 시작 <span className="font-normal text-neutral-400">(눌러서 채우고 고쳐 쓰세요)</span></p>
            <div className="mb-6 flex flex-wrap gap-2">
              {QUICK_STARTS.map((q) => (
                <button
                  key={q.key}
                  type="button"
                  onClick={() => setDescription(q.description)}
                  className="flex h-11 items-center gap-2 rounded-full border-2 border-neutral-200 px-4 text-base font-semibold hover:border-emerald-400 hover:bg-emerald-50 dark:border-neutral-700 dark:hover:bg-emerald-950/30"
                >
                  <Icon icon={q.icon} className="text-[20px] text-emerald-600" />
                  {q.label}
                </button>
              ))}
            </div>
            <label htmlFor="desc" className="mb-2 block text-lg font-semibold">
              만들고 싶은 그림 설명
            </label>
            <textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="예) 봄맞이 할인 행사 배너, 벚꽃과 밝은 분홍색 배경"
              className="w-full rounded-2xl border-2 border-neutral-200 bg-neutral-50 p-4 text-lg outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 dark:border-neutral-800 dark:bg-neutral-900"
            />
            <label htmlFor="txt" className="mb-2 mt-6 block text-lg font-semibold">
              그림에 넣을 글자 <span className="font-normal text-neutral-400">(없으면 비워 두세요)</span>
            </label>
            <input
              id="txt"
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="예) 봄맞이 30% 할인"
              className="h-14 w-full rounded-2xl border-2 border-neutral-200 bg-neutral-50 px-4 text-lg outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 dark:border-neutral-800 dark:bg-neutral-900"
            />
          </Section>
        )}

        {step === 5 && (size || custom) && (
          <Section title="이대로 만들까요?" desc="확인하고 만들기를 눌러 주세요.">
            <dl className="divide-y divide-neutral-200 rounded-2xl border-2 border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              <SummaryRow label="종류" value={kind === "banner" ? "배너" : "전단지"} />
              <SummaryRow label="업종" value={biz?.label ?? "-"} />
              <SummaryRow
                label="크기"
                value={custom ? `직접 (${effW}×${effH})` : `${size!.label} (${size!.w}×${size!.h})`}
              />
              <SummaryRow label="품질" value={QUALITIES.find((q) => q.key === quality)?.label ?? quality} />
              <SummaryRow label="설명" value={description} />
              {textContent.trim() && <SummaryRow label="넣을 글자" value={textContent} />}
            </dl>
            <EstimateBar estimate={estimate} />
            {error && (
              <div role="alert" className="mt-4 flex items-start gap-3 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                <Icon icon="ph:warning-circle-fill" className="mt-0.5 text-[22px]" />
                <span className="text-base">{error}</span>
              </div>
            )}
          </Section>
        )}

        {/* 하단 이동 버튼 */}
        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            onClick={() => (step === 1 ? guardedExit() : setStep((s) => s - 1))}
            className="flex h-14 items-center gap-2 rounded-2xl px-5 text-lg font-semibold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Icon icon="ph:arrow-left-bold" className="text-[20px]" />
            {step === 1 ? "처음으로" : "이전"}
          </button>

          {step < 5 ? (
            <BigButton icon="ph:arrow-right-bold" iconRight disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              다음
            </BigButton>
          ) : (
            <BigButton icon="ph:magic-wand-bold" onClick={() => onGenerate()}>
              만들기
            </BigButton>
          )}
        </div>
      </div>
    </Shell>
  );
}

/* ───────── 재사용 조각들 ───────── */

function Shell({ children, onExit }: { children: React.ReactNode; onExit: () => void }) {
  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white">
            <Icon icon="ph:magic-wand-duotone" className="text-[20px]" />
          </span>
          홍보물 만들기
        </div>
        <button onClick={onExit} className="flex h-11 items-center gap-1 rounded-xl px-3 text-base text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          <Icon icon="ph:x-bold" /> 그만두기
        </button>
      </header>
      <main className="px-5 py-8">{children}</main>
    </div>
  );
}

function Steps({ step }: { step: number }) {
  return (
    <ol className="mx-auto flex max-w-3xl items-center justify-between">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg font-bold ${
                active
                  ? "bg-emerald-600 text-white"
                  : done
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800"
              }`}
            >
              {done ? <Icon icon="ph:check-bold" /> : n}
            </span>
            <span className={`hidden text-base sm:inline ${active ? "font-semibold" : "text-neutral-400"}`}>{label}</span>
            {n < STEP_LABELS.length && <span className="mx-1 hidden h-0.5 flex-1 bg-neutral-200 sm:block dark:bg-neutral-800" />}
          </li>
        );
      })}
    </ol>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rise">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-lg text-neutral-500 dark:text-neutral-400">{desc}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function ChoiceCard({
  active,
  icon,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  icon: string;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-4 rounded-2xl border-2 p-5 text-left transition ${
        active
          ? "border-emerald-500 bg-emerald-50 ring-4 ring-emerald-500/15 dark:bg-emerald-950/30"
          : "border-neutral-200 hover:border-emerald-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
      }`}
    >
      <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${active ? "bg-emerald-600 text-white" : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"}`}>
        <Icon icon={icon} className="text-[30px]" />
      </span>
      <span>
        <span className="block text-xl font-bold">{title}</span>
        {desc && <span className="block text-base text-neutral-500 dark:text-neutral-400">{desc}</span>}
      </span>
    </button>
  );
}

function EstimateBar({ estimate }: { estimate: Estimate | null }) {
  if (!estimate) return null;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-emerald-50 px-5 py-4 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
      <span className="flex items-center gap-2 text-lg">
        <Icon icon="ph:coins-duotone" className="text-[22px]" />
        한 장에 약 <b>{krw(estimate.estimated_cost_krw)}</b>
      </span>
      <span className="flex items-center gap-2 text-lg">
        <Icon icon="ph:stack-duotone" className="text-[22px]" />
        {estimate.remaining_images === null ? (
          <>앞으로 <b>제한 없이</b> 만들 수 있어요</>
        ) : (
          <>이 계정으로 앞으로 약 <b>{estimate.remaining_images.toLocaleString("ko-KR")}장</b></>
        )}
      </span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 px-5 py-4">
      <dt className="w-24 shrink-0 text-lg font-semibold text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="text-lg">{value}</dd>
    </div>
  );
}

function BigButton({
  children,
  icon,
  iconRight,
  onClick,
  disabled,
  tone = "primary",
}: {
  children: React.ReactNode;
  icon: string;
  iconRight?: boolean;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "soft" | "ghost";
}) {
  const tones = {
    primary: "bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-500",
    soft: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200",
    ghost: "border-2 border-neutral-200 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-14 items-center justify-center gap-2 rounded-2xl px-7 text-xl font-bold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      {!iconRight && <Icon icon={icon} className="text-[22px]" />}
      {children}
      {iconRight && <Icon icon={icon} className="text-[22px]" />}
    </button>
  );
}
