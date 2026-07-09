import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import {
  SIZES,
  MAX_PX,
  QUICK_STARTS,
  BUSINESS_TYPES,
  COLORS,
  NEWSPAPER_HINT,
  FLYER_HINT,
  toPx,
  fetchEstimate,
  generate,
  copywrite,
  krw,
  downloadImage,
  getRecentPrompts,
  pushRecentPrompt,
  listGenerations,
  type Estimate,
  type GenerateResult,
  type SizePreset,
  type Unit,
  type BizType,
  type RecentGen,
  type ColorChoice,
} from "../lib/studio";
import { listFolders, createFolder, withDepth, type Folder } from "../lib/folders";
import { updateTemplate } from "../lib/library";
import { InputDialog, useDismiss } from "../components/dialogs";

type Kind = "banner" | "flyer";
const QUALITIES = [
  { key: "low", label: "빠르게 (저렴)", desc: "연습·초안용" },
  { key: "medium", label: "보통 (추천)", desc: "대부분 이걸로 충분" },
  { key: "high", label: "고급 (선명)", desc: "인쇄·중요한 것" },
];

const STEP_LABELS = ["종류", "업종", "크기·품질", "문구", "만들기"];

// 생성 중 표시할 AI 작업 상태(순환)
const LOADING_STEPS = [
  { icon: "ph:brain-duotone", text: "무엇을 그릴지 생각하고 있어요" },
  { icon: "ph:paint-roller-duotone", text: "바탕을 칠하는 중이에요" },
  { icon: "ph:palette-duotone", text: "색을 입히는 중이에요" },
  { icon: "ph:text-aa-duotone", text: "글자와 모양을 다듬는 중이에요" },
  { icon: "ph:sparkle-duotone", text: "마무리하는 중이에요" },
];

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
  const [description, setDescription] = useState("");
  const [bizName, setBizName] = useState(""); // 업체명 — 그림에 크게 넣을 주 문구
  const [textContent, setTextContent] = useState(""); // 배너: 더 넣을 짧은 문구
  const [flyerText, setFlyerText] = useState(""); // 전단지: 여러 줄 문구(항목·연락처 등)
  const [title, setTitle] = useState(""); // 저장될 제목(파일명·프로젝트명)
  const [color, setColor] = useState<ColorChoice | null>(null); // 배경 색상 선택
  const [refGen, setRefGen] = useState<RecentGen | null>(null); // 참고할 최근 생성 이미지
  const [copyIdeas, setCopyIdeas] = useState<string[]>([]);
  const [copyBusy, setCopyBusy] = useState(false);

  // 최근 생성 이미지(참고 이미지 선택용) + 최근 입력 프롬프트
  const [recentGens, setRecentGens] = useState<RecentGen[]>([]);
  const [showRefPicker, setShowRefPicker] = useState(false);
  const [showRecentPrompts, setShowRecentPrompts] = useState(false);

  // 결과 화면: 제목·폴더 저장 + '비슷하게 다시 만들기' 보완 프롬프트
  const [folders, setFolders] = useState<Folder[]>([]);
  const [projName, setProjName] = useState("");
  const [projFolderId, setProjFolderId] = useState("");
  const [projSaving, setProjSaving] = useState(false);
  const [projSaved, setProjSaved] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenText, setRegenText] = useState("");

  useEffect(() => {
    listGenerations()
      .then(setRecentGens)
      .catch(() => setRecentGens([]));
    listFolders()
      .then(setFolders)
      .catch(() => setFolders([]));
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
  const [busy, setBusy] = useState(false);
  const [busyStep, setBusyStep] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GenerateResult | null>(null);

  // 생성 중일 때 상태 메시지 순환
  useEffect(() => {
    if (!busy) return;
    setBusyStep(0);
    const t = setInterval(() => {
      setBusyStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 3500);
    return () => clearInterval(t);
  }, [busy]);

  // 생성 결과가 나오면 제목/폴더 저장 상태 초기화
  //  (사용자가 만들기 단계에서 입력한 제목 우선 → 없으면 서버가 지은 이름)
  useEffect(() => {
    if (result) {
      setProjName(title.trim() || result.project_name || "새 홍보물");
      setProjFolderId("");
      setProjSaved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

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
    setSize(SIZES[k][0]);
    setCustom(false);
    setStep(2);
  }

  function pickBiz(b: BizType) {
    setBiz(b);
    if (b.key === "etc") return; // 직접 입력 후 [다음]으로 진행
    setStep(3);
  }

  async function onGenerate(refGenerationId?: string, extraPrompt?: string) {
    if (!effW || !effH) return;
    setBusy(true);
    setError("");
    try {
      // 참고 이미지: "비슷하게 다시 만들기"(인자) 우선, 아니면 문구 단계에서 고른 최근 이미지
      const refId = refGenerationId || refGen?.id;
      const hasRef = !!refId;
      const isFlyer = kind === "flyer";
      // 그림에 넣을 글자: 전단지는 업체명+전단지 문구(여러 줄), 배너는 업체명+짧은 문구
      const wantedText = isFlyer
        ? [bizName.trim(), flyerText.trim()].filter(Boolean).join("\n")
        : [bizName.trim(), textContent.trim()].filter(Boolean).join("\n");
      const colorHint = color ? ` 전체적인 색감과 분위기를 ${color.name} 계열로 조화롭게 통일해, 밝고 선명하게.` : "";
      const extra = extraPrompt?.trim() ? ` ${extraPrompt.trim()}.` : "";
      const hint = isFlyer ? FLYER_HINT : NEWSPAPER_HINT;
      const fullPrompt = `${bizLabel ? `[업종: ${bizLabel}] ` : ""}${description}.${extra}${colorHint} ${hint}`;
      pushRecentPrompt(description); // 다음에 재사용할 수 있게 저장
      const r = await generate({
        prompt: fullPrompt,
        width: effW,
        height: effH,
        quality,
        mode: "ai_text",
        text_content: wantedText || undefined,
        // 프로젝트 제목: 입력한 제목 > 업체명 (문구 전체가 제목으로 들어가지 않게)
        name: title.trim() || bizName.trim() || undefined,
        kind: kind || undefined,
        ref_generation_id: refId,
        similarity: hasRef ? 2 : undefined,
      });
      setResult(r);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { detail?: string } } };
      const detail = err?.response?.data?.detail;
      setError(
        err?.response?.status === 402
          ? "이번 달 사용할 수 있는 금액을 넘었어요. 관리자에게 문의하세요."
          : detail
            ? `이미지를 만들지 못했어요: ${detail}`
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
    setBizEtc("");
    setSize(null);
    setDescription("");
    setBizName("");
    setTextContent("");
    setFlyerText("");
    setTitle("");
    setColor(null);
    setRefGen(null);
    setCopyIdeas([]);
  }

  // 마법사 도중 이탈 시 입력 손실 확인
  function guardedExit() {
    const hasProgress = !!kind || description.trim() || bizName.trim() || textContent.trim();
    if (hasProgress && !window.confirm("지금 나가면 입력한 내용이 사라져요. 나갈까요?")) return;
    nav("/");
  }

  // 결과 프로젝트의 제목·폴더 저장
  async function saveProject() {
    if (!result || !projName.trim()) return;
    setProjSaving(true);
    try {
      await updateTemplate(result.project_id, {
        name: projName.trim(),
        folder_id: projFolderId || null,
        move_to_root: !projFolderId,
      });
      setProjSaved(true);
    } catch {
      /* 저장 실패 시 조용히 무시 — 최근 만든 것에는 이미 남아 있음 */
    } finally {
      setProjSaving(false);
    }
  }

  async function addFolder(name: string) {
    try {
      const f = await createFolder(name);
      setFolders((prev) => [...prev, f]);
      setProjFolderId(f.id);
    } catch {
      /* 무시 */
    } finally {
      setNewFolderOpen(false);
    }
  }

  // "비슷하게 다시 만들기" — 보완 프롬프트 입력 후 진행
  function startRegen() {
    setRegenText("");
    setRegenOpen(true);
  }
  function confirmRegen() {
    if (!result) return;
    const extra = regenText;
    setRegenOpen(false);
    onGenerate(result.generation_id, extra);
  }

  async function handleDownload(url: string, format: "png" | "jpg") {
    try {
      const fname = title.trim() || result?.project_name || "홍보물";
      await downloadImage(url, format, fname);
    } catch {
      alert("내려받기에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  // ───────── 결과 화면 (생성 중이면 아래 busy 화면을 먼저 보여줌) ─────────
  if (result && !busy) {
    return (
      <Shell onExit={() => nav("/")}>
        <div className="mx-auto max-w-3xl">
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Icon icon="ph:check-circle-duotone" className="text-emerald-500" />
            완성됐어요!
          </h1>
          <p className="mt-2 text-lg text-neutral-500 dark:text-neutral-400">
            아래에서 그림을 내려받으세요. 이번에 <b>{krw(result.cost_krw)}</b> 썼어요
            {result.remaining_krw === null ? " (잔액 무제한)." : (
              <> · 이번 달 남은 금액 <b>{krw(result.remaining_krw)}</b>.</>
            )}
          </p>

          <div className="mt-6 overflow-hidden rounded-3xl border-2 border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
            <img src={result.image_url} alt="만든 홍보물" className="mx-auto max-h-[62vh] w-auto" />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <BigButton
              icon="ph:pencil-simple-bold"
              onClick={() =>
                nav("/editor", {
                  state: {
                    imageUrl: result.image_url,
                    w: effW,
                    h: effH,
                    generationId: result.generation_id,
                    templateId: result.project_id,
                    quality,
                    kind,
                    pages: [
                      { id: result.page_id, sort_order: 0, bg_url: result.image_url, canvas_json: null },
                    ],
                  },
                })
              }
            >
              글자 수정 또는 추가
            </BigButton>
            <BigButton icon="ph:arrows-clockwise-bold" tone="soft" onClick={startRegen}>
              비슷하게 다시 만들기
            </BigButton>
          </div>

          {/* 저장 위치: 제목 + 폴더 (자동 생성된 프로젝트를 정리) */}
          <div className="mt-6 rounded-3xl border-2 border-neutral-200 p-5 dark:border-neutral-800">
            <p className="flex items-center gap-2 text-lg font-semibold">
              <Icon icon="ph:folder-open-duotone" className="text-emerald-600 text-[24px]" />
              보관함에 저장하기
            </p>
            <p className="mt-1 text-base text-neutral-500 dark:text-neutral-400">
              제목을 정하고 폴더를 골라 두면 나중에 쉽게 찾을 수 있어요.
            </p>
            <label htmlFor="projname" className="mt-4 mb-1 block text-base font-semibold">제목</label>
            <input
              id="projname"
              value={projName}
              onChange={(e) => {
                setProjName(e.target.value);
                setProjSaved(false);
              }}
              placeholder="예) 봄맞이 할인 배너"
              className="h-14 w-full rounded-2xl border-2 border-neutral-200 bg-neutral-50 px-4 text-lg outline-none focus:border-emerald-500 dark:border-neutral-800 dark:bg-neutral-900"
            />
            <label htmlFor="projfolder" className="mt-4 mb-1 block text-base font-semibold">폴더</label>
            <div className="flex flex-wrap gap-2">
              <select
                id="projfolder"
                value={projFolderId}
                onChange={(e) => {
                  setProjFolderId(e.target.value);
                  setProjSaved(false);
                }}
                className="h-14 flex-1 rounded-2xl border-2 border-neutral-200 bg-neutral-50 px-3 text-lg outline-none focus:border-emerald-500 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <option value="">폴더 없음</option>
                {withDepth(folders).map((f) => (
                  <option key={f.id} value={f.id}>
                    {" ".repeat(f.depth * 2)}
                    {f.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setNewFolderOpen(true)}
                className="flex h-14 items-center gap-1.5 rounded-2xl border-2 border-neutral-200 px-4 text-base font-semibold text-neutral-600 hover:border-emerald-400 hover:bg-emerald-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-emerald-950/30"
              >
                <Icon icon="ph:folder-plus-duotone" className="text-emerald-600 text-[20px]" /> 새 폴더
              </button>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <BigButton icon={projSaved ? "ph:check-bold" : "ph:floppy-disk-bold"} tone={projSaved ? "soft" : "primary"} disabled={projSaving || !projName.trim()} onClick={saveProject}>
                {projSaving ? "저장 중..." : projSaved ? "저장됨" : "이 위치에 저장"}
              </BigButton>
              {projSaved && (
                <span className="flex items-center gap-1 text-base text-emerald-700 dark:text-emerald-300">
                  <Icon icon="ph:check-circle-fill" /> 보관함에 저장했어요
                </span>
              )}
            </div>
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
            <BigButton icon="ph:folders-bold" tone="ghost" onClick={() => nav("/library")}>
              보관함으로 이동
            </BigButton>
          </div>
        </div>

        {/* 비슷하게 다시 만들기 — 보완 프롬프트 입력 (#2) */}
        {regenOpen && (
          <PickerModal
            title="어떻게 바꿀까요?"
            desc="이번 그림과 비슷하게 다시 만들어요. 바꾸고 싶은 점을 적으면 반영해요. (비워 두면 그대로 비슷하게)"
            icon="ph:arrows-clockwise-duotone"
            onClose={() => setRegenOpen(false)}
          >
            <textarea
              autoFocus
              value={regenText}
              onChange={(e) => setRegenText(e.target.value)}
              rows={3}
              placeholder="예) 배경을 더 밝게, 글자를 더 크게"
              className="w-full rounded-2xl border-2 border-neutral-200 bg-neutral-50 p-4 text-lg outline-none focus:border-emerald-500 dark:border-neutral-800 dark:bg-neutral-900"
            />
            <div className="mt-4 flex gap-2">
              <BigButton icon="ph:magic-wand-bold" onClick={confirmRegen}>
                다시 만들기
              </BigButton>
              <BigButton icon="ph:x-bold" tone="ghost" onClick={() => setRegenOpen(false)}>
                취소
              </BigButton>
            </div>
          </PickerModal>
        )}

        <InputDialog
          open={newFolderOpen}
          icon="ph:folder-plus-duotone"
          title="새 폴더 만들기"
          placeholder="예) 봄 행사"
          confirmLabel="만들기"
          onConfirm={addFolder}
          onClose={() => setNewFolderOpen(false)}
        />
      </Shell>
    );
  }

  // ───────── 생성 중 ─────────
  if (busy) {
    const msg = LOADING_STEPS[Math.min(busyStep, LOADING_STEPS.length - 1)];
    return (
      <Shell onExit={() => nav("/")}>
        <div className="mx-auto flex max-w-lg flex-col items-center py-20 text-center">
          <Icon icon="ph:spinner-gap-bold" className="animate-spin text-6xl text-emerald-500" />
          <h1 className="mt-6 text-3xl font-bold">그림을 만들고 있어요</h1>
          <p className="mt-3 flex items-center gap-2 text-xl font-semibold text-emerald-700 dark:text-emerald-300">
            <Icon icon={msg.icon} className="text-[24px]" />
            {msg.text}
          </p>
          <p className="mt-2 text-lg text-neutral-500 dark:text-neutral-400">
            30초쯤 걸려요. 잠시만 기다려 주세요.
          </p>
          {/* 진행 점 */}
          <div className="mt-5 flex gap-2">
            {LOADING_STEPS.map((_, i) => (
              <span key={i} className={`h-2.5 w-2.5 rounded-full ${i <= busyStep ? "bg-emerald-500" : "bg-neutral-200 dark:bg-neutral-700"}`} />
            ))}
          </div>
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
              참고할 이미지 <span className="font-normal text-neutral-400">(선택 · 최근 만든 것과 비슷하게 만들어요)</span>
            </p>
            {refGen ? (
              <div className="flex items-center gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <img src={refGen.thumb_url} alt="참고 이미지" className="h-16 w-16 rounded-lg object-cover" />
                <span className="flex-1 truncate text-base">{refGen.prompt?.slice(0, 24) || "최근 만든 이미지"}</span>
                <button type="button" onClick={() => setRefGen(null)} className="flex h-10 items-center gap-1 rounded-lg px-3 text-base text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  <Icon icon="ph:x-bold" /> 빼기
                </button>
              </div>
            ) : recentGens.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowRefPicker(true)}
                className="flex h-14 w-full items-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 px-4 text-lg text-neutral-500 hover:border-emerald-400 hover:text-emerald-700 dark:border-neutral-700"
              >
                <Icon icon="ph:images-duotone" className="text-[24px]" />
                최근 만든 이미지에서 고르기
              </button>
            ) : (
              <p className="rounded-2xl border-2 border-dashed border-neutral-200 px-4 py-4 text-base text-neutral-400 dark:border-neutral-800">
                아직 만든 이미지가 없어요. 하나 만들면 여기서 골라 비슷하게 만들 수 있어요.
              </p>
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
              {refGen && <SummaryRow label="참고 이미지" value="최근 만든 것과 비슷하게" />}
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
