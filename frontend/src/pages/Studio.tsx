import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { useJobs } from "../lib/jobs";
import {
  SIZES,
  MAX_PX,
  QUICK_STARTS,
  BUSINESS_TYPES,
  COLORS,
  NEWSPAPER_HINT,
  FLYER_HINT,
  FREEDOMS,
  josa,
  variationHint,
  getFreedom,
  setFreedom,
  fetchDefaultSizes,
  toPx,
  fetchEstimate,
  generateWithRetry,
  inputItems,
  fetchMySizes,
  uploadRef,
  copywrite,
  krw,
  getRecentPrompts,
  pushRecentPrompt,
  listGenerations,
  type Estimate,
  type SizePrefs,
  type SizeChoice,
  type SizePreset,
  type Unit,
  type BizType,
  type RecentGen,
  type ColorChoice,
  type Freedom,
} from "../lib/studio";
import { useDismiss } from "../components/dialogs";

type Kind = "banner" | "flyer";
const QUALITIES = [
  { key: "low", label: "빠르게 (저렴)", desc: "연습·초안용" },
  { key: "medium", label: "보통 (추천)", desc: "대부분 이걸로 충분" },
  { key: "high", label: "고급 (선명)", desc: "인쇄·중요한 것" },
];

const STEP_LABELS = ["종류", "업종", "크기·품질", "문구", "만들기"];

export default function Studio() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<Kind | null>(null);
  const [biz, setBiz] = useState<BizType | null>(null);
  const [bizEtc, setBizEtc] = useState(""); // "기타" 선택 시 직접 입력
  const [size, setSize] = useState<SizePreset | null>(null);
  // 직접 크기 입력
  const [custom, setCustom] = useState(false);
  const [cw, setCw] = useState(1024);
  const [ch, setCh] = useState(400);
  const [unit, setUnit] = useState<Unit>("px");
  const [quality, setQuality] = useState("medium");
  const [freedom, setFreedomState] = useState<Freedom>(getFreedom); // 세션에 저장된 값으로 시작
  const [description, setDescription] = useState("");
  const [bizName, setBizName] = useState(""); // 업체명 — 그림에 크게 넣을 주 문구
  const [textContent, setTextContent] = useState(""); // 배너: 더 넣을 짧은 문구
  const [flyerText, setFlyerText] = useState(""); // 전단지: 여러 줄 문구(항목·연락처 등)
  const [title, setTitle] = useState(""); // 저장될 제목(파일명·프로젝트명)
  const [color, setColor] = useState<ColorChoice | null>(null); // 배경 색상 선택
  const [refGen, setRefGen] = useState<RecentGen | null>(null); // 참고할 최근 생성 이미지
  const [refFile, setRefFile] = useState<File | null>(null); // 참고할 업로드 이미지
  const [copyIdeas, setCopyIdeas] = useState<string[]>([]);
  const [copyBusy, setCopyBusy] = useState(false);

  // 최근 생성 이미지(참고 이미지 선택용) + 최근 입력 프롬프트
  const [recentGens, setRecentGens] = useState<RecentGen[]>([]);
  const [showRefPicker, setShowRefPicker] = useState(false);
  const [showRecentPrompts, setShowRecentPrompts] = useState(false);

  // 이 계정이 마지막에 고른 크기(배너·전단지 따로) — 종류를 고르면 그대로 골라 둔다
  const [sizePrefs, setSizePrefs] = useState<SizePrefs>({});

  // 관리자 설정 기본 사이즈 → 종류별 첫 번째(추천) 옵션으로
  const [adminSizes, setAdminSizes] = useState<{ banner: { w: number; h: number }; flyer: { w: number; h: number } } | null>(null);
  function sizeOptions(k: Kind): SizePreset[] {
    const base = SIZES[k];
    if (!adminSizes) return base;
    const d = adminSizes[k];
    const def: SizePreset = { key: "admin_default", label: "기본 크기", w: d.w, h: d.h, hint: "추천" };
    return [def, ...base.filter((s) => !(s.w === d.w && s.h === d.h))];
  }

  useEffect(() => {
    listGenerations()
      .then(setRecentGens)
      .catch(() => setRecentGens([]));
    fetchDefaultSizes()
      .then(setAdminSizes)
      .catch(() => setAdminSizes(null));
    fetchMySizes()
      .then(setSizePrefs)
      .catch(() => setSizePrefs({}));
  }, []);

  const [copyMsg, setCopyMsg] = useState("");
  async function suggestCopy() {
    setCopyBusy(true);
    setCopyMsg("");
    try {
      const r = await copywrite(biz?.label || "가게", description || "홍보");
      setCopyIdeas(r.candidates);
      setCopyMsg(
        `문구 추천에 ${krw(r.cost_krw)} 썼어요` +
          (r.remaining_krw === null ? " (잔액 무제한)." : ` · 이번 달 남은 금액 ${krw(r.remaining_krw)}.`),
      );
    } catch {
      setCopyIdeas([]);
    } finally {
      setCopyBusy(false);
    }
  }
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const { start: startJob, setPanelOpen } = useJobs();
  const [startedTitle, setStartedTitle] = useState(""); // 방금 백그라운드로 넘긴 작업 이름(안내용)

  // 단계가 바뀌면 화면 맨 위부터 보이게.
  // (앞 단계에서 아래로 스크롤한 상태 그대로 넘어가면 새 화면의 중간·하단이 보인다)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [step]);

  // 실제 생성 크기(px): 직접 입력이면 환산+상한, 아니면 프리셋
  const effW = custom ? Math.min(toPx(cw, unit), MAX_PX) : size?.w ?? 0;
  const effH = custom ? Math.min(toPx(ch, unit), MAX_PX) : size?.h ?? 0;

  // 업종 표시/주입용 라벨 ("기타"면 직접 입력값)
  const bizLabel = biz ? (biz.key === "etc" ? bizEtc.trim() || "기타" : biz.label) : "";

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
    if (step === 2) return !!biz && (biz.key !== "etc" || bizEtc.trim().length > 0);
    if (step === 3) return custom ? cw > 0 && ch > 0 : !!size;
    if (step === 4) return description.trim().length > 0;
    return true;
  }, [step, kind, biz, bizEtc, size, custom, cw, ch, description]);

  function pickKind(k: Kind) {
    setKind(k);
    const opts = sizeOptions(k);
    const pref = sizePrefs[k];
    // 직접 입력칸: 지난번 이 종류에서 입력한 값(없으면 추천 크기)
    setCw(pref?.custom.w ?? opts[0].w);
    setCh(pref?.custom.h ?? opts[0].h);
    setUnit(pref?.custom.unit ?? "px");
    if (pref?.mode === "custom") {
      setCustom(true);
      setSize(opts[0]);
    } else {
      setCustom(false);
      setSize(opts.find((o) => o.key === pref?.preset_key) ?? opts[0]);
    }
    setStep(2);
  }

  function pickBiz(b: BizType) {
    setBiz(b);
    if (b.key === "etc") return; // 직접 입력 후 [다음]으로 진행
    setStep(3);
  }

  /** 만들기 — 백그라운드 작업으로 넘기고 마법사는 처음으로 돌아간다(그동안 또 만들 수 있게) */
  function onGenerate() {
    if (!effW || !effH) return;
    const isFlyer = kind === "flyer";
    // 그림에 넣을 글자: 전단지는 업체명+전단지 문구(여러 줄), 배너는 업체명+짧은 문구
    const wantedText = isFlyer
      ? [bizName.trim(), flyerText.trim()].filter(Boolean).join("\n")
      : [bizName.trim(), textContent.trim()].filter(Boolean).join("\n");
    const colorHint = color ? ` 전체적인 색감과 분위기를 ${color.name} 계열로 조화롭게 통일해, 밝고 선명하게.` : "";
    const hint = isFlyer ? FLYER_HINT : NEWSPAPER_HINT;
    const file = refFile; // 마법사를 비우기 전에 붙잡아 둔다
    const refId = file ? undefined : refGen?.id;
    const hasRef = !!file || !!refId;
    // 참고 이미지가 있으면 "비슷하게"가 목적이므로 변주를 넣지 않는다.
    const varied = hasRef ? "" : variationHint(freedom);
    const fullPrompt = `${bizLabel ? `[업종: ${bizLabel}] ` : ""}${description}.${colorHint} ${hint}${varied}`;
    pushRecentPrompt(description); // 다음에 재사용할 수 있게 저장
    const jobTitle = title.trim() || bizName.trim() || description.trim().slice(0, 24) || "새 홍보물";
    // 고른 크기를 계정에 기억(서버) + 바로 이어 만들 때를 위해 화면에도 반영
    const sizeChoice: SizeChoice | undefined = kind
      ? {
          kind,
          mode: custom ? "custom" : "preset",
          preset_key: custom ? undefined : size?.key,
          custom_w: cw,
          custom_h: ch,
          custom_unit: unit,
        }
      : undefined;
    if (sizeChoice) {
      setSizePrefs((prev) => ({
        ...prev,
        [sizeChoice.kind]: {
          mode: sizeChoice.mode,
          preset_key: sizeChoice.preset_key ?? null,
          custom: { w: cw, h: ch, unit },
        },
      }));
    }
    const payload = {
      prompt: fullPrompt,
      width: effW,
      height: effH,
      quality,
      mode: "ai_text" as const,
      text_content: wantedText || undefined,
      // 프로젝트 제목: 입력한 제목 > 업체명 (문구 전체가 제목으로 들어가지 않게)
      name: title.trim() || bizName.trim() || undefined,
      kind: kind || undefined,
      ref_generation_id: refId,
      similarity: hasRef ? 2 : undefined,
      size_choice: sizeChoice,
      user_input: inputItems([
        ["종류", isFlyer ? "전단지" : "배너"],
        ["업종", bizLabel],
        ["설명", description],
        ["업체명", bizName],
        [isFlyer ? "전단지 문구" : "넣을 글자", isFlyer ? flyerText : textContent],
        ["색감", color?.name],
        ["참고 이미지", file ? "직접 올린 이미지와 비슷하게" : refId ? "이전 결과와 비슷하게" : ""],
        ["제목", title],
      ]),
    };
    startJob({
      kind: "new",
      title: jobTitle,
      run: async (setNote) => {
        const refUploadId = file ? await uploadRef(file) : undefined;
        return generateWithRetry({ ...payload, ref_upload_id: refUploadId }, (tryNo, total) =>
          setNote(`안전 검사에 걸려서 다시 만들고 있어요 (${tryNo}번째 시도 / 최대 ${total}번)`),
        );
      },
    });
    restart();
    setStartedTitle(jobTitle);
  }

  function restart() {
    setStep(1);
    setKind(null);
    setBiz(null);
    setBizEtc("");
    setSize(null);
    setDescription("");
    setBizName("");
    setTextContent("");
    setFlyerText("");
    setTitle("");
    setColor(null);
    setRefGen(null);
    setRefFile(null);
    setCopyIdeas([]);
  }

  // 마법사 도중 이탈 시 입력 손실 확인
  function guardedExit() {
    const hasProgress = !!kind || description.trim() || bizName.trim() || textContent.trim();
    if (hasProgress && !window.confirm("지금 나가면 입력한 내용이 사라져요. 나갈까요?")) return;
    nav("/");
  }

  // ───────── 마법사 ─────────
  return (
    <Shell onExit={guardedExit}>
      <Steps step={step} />
      <div className="mx-auto mt-8 max-w-3xl">
        {startedTitle && step === 1 && (
          <div role="status" className="rise mb-8 flex flex-wrap items-center gap-4 rounded-3xl border-2 border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white">
              <Icon icon="ph:paper-plane-tilt-duotone" className="text-[30px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-bold">“{startedTitle}” 만들기를 시작했어요</p>
              <p className="mt-0.5 text-base text-neutral-600 dark:text-neutral-300">
                30초쯤 걸려요. 화면 위쪽 알림에서 진행 상황을 볼 수 있고, 그동안 다른 홍보물을 또 만들어도 돼요.
              </p>
            </div>
            <button
              onClick={() => setPanelOpen(true)}
              className="flex h-12 items-center gap-1.5 rounded-2xl bg-white px-4 text-lg font-bold text-emerald-800 ring-2 ring-emerald-300 hover:bg-emerald-100 dark:bg-neutral-900 dark:text-emerald-200 dark:ring-emerald-800"
            >
              진행 상황 보기 <Icon icon="ph:caret-right-bold" />
            </button>
          </div>
        )}
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

            {biz?.key === "etc" && (
              <div className="mt-4">
                <label htmlFor="bizetc" className="mb-2 block text-lg font-semibold">
                  업종을 직접 적어 주세요
                </label>
                <input
                  id="bizetc"
                  autoFocus
                  value={bizEtc}
                  onChange={(e) => setBizEtc(e.target.value)}
                  placeholder="예) 세탁소, 학원, 동물병원"
                  className="h-14 w-full max-w-md rounded-2xl border-2 border-neutral-200 bg-neutral-50 px-4 text-lg outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 dark:border-neutral-800 dark:bg-neutral-900"
                />
              </div>
            )}
          </Section>
        )}

        {step === 3 && kind && (
          <Section title="크기와 품질을 골라요" desc="잘 모르면 추천된 것을 그대로 두세요.">
            <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-lg font-semibold">
              크기
              {sizePrefs[kind] && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-base font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <Icon icon="ph:clock-counter-clockwise-bold" />
                  지난번에 만든 크기로 골라 뒀어요
                </span>
              )}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {sizeOptions(kind).map((s) => (
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
            <label htmlFor="bizname" className="mb-2 block text-lg font-semibold">
              업체명 <span className="font-normal text-neutral-400">(그림에 크게 넣을 이름)</span>
            </label>
            <input
              id="bizname"
              value={bizName}
              onChange={(e) => setBizName(e.target.value)}
              placeholder="예) 해뜨는 식당"
              className="h-14 w-full rounded-2xl border-2 border-neutral-200 bg-neutral-50 px-4 text-lg outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 dark:border-neutral-800 dark:bg-neutral-900"
            />

            <p className="mb-2 mt-6 text-lg font-semibold">
              전체 색감 <span className="font-normal text-neutral-400">(선택 · 그림 전체의 색상 분위기를 정해요)</span>
            </p>
            <div className="flex flex-wrap gap-2.5">
              {COLORS.map((c) => {
                const active = color?.name === c.name;
                return (
                  <button
                    key={c.name}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setColor(active ? null : c)}
                    title={c.name}
                    className={`flex h-12 items-center gap-2 rounded-2xl border-2 pl-2 pr-3 text-base font-semibold transition ${
                      active
                        ? "border-emerald-500 bg-emerald-50 ring-4 ring-emerald-500/15 dark:bg-emerald-950/30"
                        : "border-neutral-200 hover:border-emerald-300 dark:border-neutral-700"
                    }`}
                  >
                    <span
                      className="grid h-8 w-8 place-items-center rounded-xl border border-black/10"
                      style={{ backgroundColor: c.hex }}
                    >
                      {active && (
                        <Icon
                          icon="ph:check-bold"
                          className={c.name === "흰색" || c.name === "노랑" ? "text-neutral-800" : "text-white"}
                        />
                      )}
                    </span>
                    {c.name}
                  </button>
                );
              })}
            </div>

            <p className="mb-2 mt-6 text-lg font-semibold">빠른 시작 <span className="font-normal text-neutral-400">(눌러서 채우고 고쳐 쓰세요)</span></p>
            <div className="mb-4 flex flex-wrap gap-2">
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
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label htmlFor="desc" className="text-lg font-semibold">
                만들고 싶은 그림 설명
              </label>
              <button
                type="button"
                onClick={() => setShowRecentPrompts(true)}
                className="ml-auto flex h-9 items-center gap-1.5 rounded-full border-2 border-neutral-200 px-3 text-sm font-semibold text-neutral-600 hover:border-emerald-400 hover:bg-emerald-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-emerald-950/30"
              >
                <Icon icon="ph:clock-counter-clockwise-duotone" className="text-emerald-600" />
                최근 입력
              </button>
            </div>
            <textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="예) 봄맞이 할인 행사 배너, 벚꽃과 밝은 분홍색 배경"
              className="w-full rounded-2xl border-2 border-neutral-200 bg-neutral-50 p-4 text-lg outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 dark:border-neutral-800 dark:bg-neutral-900"
            />

            {kind === "flyer" ? (
              <>
                <label htmlFor="flyertxt" className="mb-2 mt-6 block text-lg font-semibold">
                  전단지 문구 <span className="font-normal text-neutral-400">(그림에 넣을 내용을 줄바꿈해 적어 주세요)</span>
                </label>
                <p className="mb-2 text-base text-neutral-500 dark:text-neutral-400">
                  제목 아래에 들어갈 항목·안내·연락처를 한 줄씩 적으면 그대로 배치돼요.
                </p>
                <textarea
                  id="flyertxt"
                  value={flyerText}
                  onChange={(e) => setFlyerText(e.target.value)}
                  rows={8}
                  placeholder={"예)\n직원 모집 (남/여)\n주방 보조 · 홀 서빙\n근무: 오전 9시~오후 6시\n식사 제공 · 4대보험\n위치: 서울시 강남구 테헤란로 123\n전화: 010-1234-5678"}
                  className="w-full rounded-2xl border-2 border-neutral-200 bg-neutral-50 p-4 text-lg outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 dark:border-neutral-800 dark:bg-neutral-900"
                />
              </>
            ) : (
              <>
                <div className="mb-2 mt-6 flex flex-wrap items-center gap-2">
                  <label htmlFor="txt" className="text-lg font-semibold">
                    더 넣을 글자 <span className="font-normal text-neutral-400">(선택 · 없으면 비워 두세요)</span>
                  </label>
                  <button
                    type="button"
                    onClick={suggestCopy}
                    disabled={copyBusy}
                    className="flex h-9 items-center gap-1.5 rounded-full border-2 border-emerald-300 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                  >
                    <Icon icon={copyBusy ? "ph:spinner-gap-bold" : "ph:sparkle-duotone"} className={copyBusy ? "animate-spin" : ""} />
                    {copyBusy ? "생각 중..." : "문구 추천받기"}
                  </button>
                </div>
                <p className="mb-2 text-base text-neutral-500 dark:text-neutral-400">
                  광고는 글자가 적어야 눈에 잘 들어와요. 꼭 필요한 짧은 문구만 적어 주세요.
                </p>
                {copyMsg && (
                  <p className="mb-2 flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300">
                    <Icon icon="ph:coins-duotone" className="text-[16px]" /> {copyMsg}
                  </p>
                )}
                {copyIdeas.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {copyIdeas.map((idea, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setTextContent(idea)}
                        className="rounded-xl border-2 border-neutral-200 px-3 py-2 text-left text-base hover:border-emerald-400 hover:bg-emerald-50 dark:border-neutral-700 dark:hover:bg-emerald-950/30"
                      >
                        {idea}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  id="txt"
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="예) 봄맞이 30% 할인"
                  className="h-14 w-full rounded-2xl border-2 border-neutral-200 bg-neutral-50 px-4 text-lg outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 dark:border-neutral-800 dark:bg-neutral-900"
                />
              </>
            )}

            <p className="mb-2 mt-6 text-lg font-semibold">
              참고할 이미지 <span className="font-normal text-neutral-400">(선택 · 이 이미지와 비슷하게 만들어요)</span>
            </p>
            {refFile ? (
              <div className="flex items-center gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <img src={URL.createObjectURL(refFile)} alt="참고 이미지" className="h-16 w-16 rounded-lg object-cover" />
                <span className="flex-1 truncate text-base">{refFile.name}</span>
                <button type="button" onClick={() => setRefFile(null)} className="flex h-10 items-center gap-1 rounded-lg px-3 text-base text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  <Icon icon="ph:x-bold" /> 빼기
                </button>
              </div>
            ) : refGen ? (
              <div className="flex items-center gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <img src={refGen.thumb_url} alt="참고 이미지" className="h-16 w-16 rounded-lg object-cover" />
                <span className="flex-1 truncate text-base">{refGen.prompt?.slice(0, 24) || "최근 만든 이미지"}</span>
                <button type="button" onClick={() => setRefGen(null)} className="flex h-10 items-center gap-1 rounded-lg px-3 text-base text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  <Icon icon="ph:x-bold" /> 빼기
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 px-4 text-lg text-neutral-500 hover:border-emerald-400 hover:text-emerald-700 dark:border-neutral-700">
                  <Icon icon="ph:upload-simple-duotone" className="text-[24px]" />
                  이미지 올리기
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => { setRefFile(e.target.files?.[0] ?? null); setRefGen(null); }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setShowRefPicker(true)}
                  disabled={recentGens.length === 0}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 px-4 text-lg text-neutral-500 hover:border-emerald-400 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700"
                >
                  <Icon icon="ph:images-duotone" className="text-[24px]" />
                  최근 만든 것에서 고르기
                </button>
              </div>
            )}
          </Section>
        )}

        {step === 5 && (size || custom) && (
          <Section title="이대로 만들까요?" desc="제목을 정하고 만들기를 눌러 주세요.">
            <label htmlFor="title" className="mb-1 block text-lg font-semibold">
              제목 <span className="font-normal text-neutral-400">(저장·파일 이름 · 비우면 자동으로 지어요)</span>
            </label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={bizName.trim() || "예) 봄맞이 할인 배너"}
              className="mb-5 h-14 w-full rounded-2xl border-2 border-neutral-200 bg-neutral-50 px-4 text-lg outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 dark:border-neutral-800 dark:bg-neutral-900"
            />
            {/* 자유도 — 참고 이미지가 있으면 '비슷하게'가 목적이라 적용되지 않음 */}
            {!refFile && !refGen && (
              <>
                <p className="mb-1 text-lg font-semibold">
                  그림 자유도 <span className="font-normal text-neutral-400">(같은 내용이라도 얼마나 다르게 그릴지)</span>
                </p>
                {/* 설명이 길어 3열에서는 줄바꿈이 지저분해진다 → 항상 전체폭 세로 배치 */}
                <div className="mb-5 grid gap-3">
                  {FREEDOMS.map((f) => (
                    <ChoiceCard
                      key={f.key}
                      active={freedom === f.key}
                      icon={f.icon}
                      title={f.label}
                      desc={f.desc}
                      onClick={() => {
                        setFreedomState(f.key);
                        setFreedom(f.key); // 세션에 저장 → 다음 생성에도 그대로
                      }}
                    />
                  ))}
                </div>
                {/* 고른 자유도가 어떤 결과를 내는지 예시로 설명 */}
                {(() => {
                  const f = FREEDOMS.find((x) => x.key === freedom);
                  if (!f) return null;
                  return (
                    <div
                      aria-live="polite"
                      className="mb-5 space-y-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800/70 dark:bg-emerald-950/30"
                    >
                      <p className="text-xl font-bold">
                        &lsquo;{f.label}&rsquo;{josa(f.label, "을/를")} 고르면
                      </p>
                      <FreedomLine icon="ph:shuffle-duotone" label="만들 때마다 바뀌는 것" text={f.changes} />
                      <FreedomLine icon="ph:lock-simple-duotone" label="바뀌지 않는 것" text={f.keeps} />
                      <FreedomLine icon="ph:hand-pointing-duotone" label="이럴 때 고르세요" text={f.when} />
                    </div>
                  );
                })()}
              </>
            )}
            <dl className="divide-y divide-neutral-200 rounded-2xl border-2 border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              <SummaryRow label="종류" value={kind === "banner" ? "배너" : "전단지"} />
              <SummaryRow label="업종" value={bizLabel || "-"} />
              <SummaryRow
                label="크기"
                value={custom ? `직접 (${effW}×${effH})` : `${size!.label} (${size!.w}×${size!.h})`}
              />
              <SummaryRow label="품질" value={QUALITIES.find((q) => q.key === quality)?.label ?? quality} />
              <SummaryRow label="설명" value={description} />
              {color && <SummaryRow label="전체 색감" value={color.name} />}
              {bizName.trim() && <SummaryRow label="업체명" value={bizName} />}
              {kind === "flyer"
                ? flyerText.trim() && <SummaryRow label="전단지 문구" value={flyerText} />
                : textContent.trim() && <SummaryRow label="넣을 글자" value={textContent} />}
              {refFile ? (
                <SummaryRow label="참고 이미지" value="올린 이미지와 비슷하게" />
              ) : refGen ? (
                <SummaryRow label="참고 이미지" value="최근 만든 것과 비슷하게" />
              ) : (
                <SummaryRow label="자유도" value={FREEDOMS.find((f) => f.key === freedom)?.label ?? freedom} />
              )}
            </dl>
            <EstimateBar estimate={estimate} />
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

      {/* 최근 입력한 설명 재사용 모달 (#1) */}
      {showRecentPrompts && (
        <PickerModal
          title="최근 입력한 설명"
          desc="눌러서 그대로 채워요."
          icon="ph:clock-counter-clockwise-duotone"
          onClose={() => setShowRecentPrompts(false)}
        >
          {getRecentPrompts().length === 0 ? (
            <p className="rounded-2xl border-2 border-dashed border-neutral-200 px-4 py-8 text-center text-base text-neutral-400 dark:border-neutral-800">
              아직 저장된 설명이 없어요. 홍보물을 한 번 만들면 여기에 쌓여요.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {getRecentPrompts().map((p, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      setDescription(p);
                      setShowRecentPrompts(false);
                    }}
                    className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-3 text-left text-base hover:border-emerald-400 hover:bg-emerald-50 dark:border-neutral-700 dark:hover:bg-emerald-950/30"
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PickerModal>
      )}

      {/* 참고할 최근 생성 이미지 선택 모달 (#4) */}
      {showRefPicker && (
        <PickerModal
          title="참고할 이미지 고르기"
          desc="비슷한 느낌으로 새로 만들어요."
          icon="ph:images-duotone"
          onClose={() => setShowRefPicker(false)}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {recentGens.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setRefGen(g);
                  setRefFile(null);
                  setShowRefPicker(false);
                }}
                className="overflow-hidden rounded-2xl border-2 border-neutral-200 text-left transition hover:border-emerald-400 dark:border-neutral-800"
              >
                <div className="aspect-square bg-neutral-100 dark:bg-neutral-800">
                  <img src={g.thumb_url} alt={g.prompt?.slice(0, 12) || "이미지"} className="h-full w-full object-cover" loading="lazy" />
                </div>
                <p className="truncate px-2 py-1.5 text-sm">{g.prompt?.slice(0, 16) || "홍보물"}</p>
              </button>
            ))}
          </div>
        </PickerModal>
      )}
    </Shell>
  );
}

/** 큰 목록/그리드용 모달 (dialogs.tsx의 좁은 모달과 별개) */
function PickerModal({
  title,
  desc,
  icon,
  onClose,
  children,
}: {
  title: string;
  desc?: string;
  icon: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dismiss = useDismiss(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...dismiss}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-3xl bg-white p-6 shadow-2xl dark:bg-neutral-900 rise"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Icon icon={icon} className="text-emerald-600 text-[26px]" />
              {title}
            </h2>
            {desc && <p className="mt-1 text-base text-neutral-500 dark:text-neutral-400">{desc}</p>}
          </div>
          <button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <Icon icon="ph:x-bold" className="text-[20px]" />
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
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

// 자유도 설명 한 줄 — 아이콘 + 굵은 라벨 + 쉬운 말 설명
function FreedomLine({ icon, label, text }: { icon: string; label: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon icon={icon} className="mt-1 shrink-0 text-[26px] text-emerald-600 dark:text-emerald-400" />
      <p className="text-lg leading-relaxed">
        <b className="mr-1">{label}</b>
        <span className="text-neutral-700 dark:text-neutral-300">{text}</span>
      </p>
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
