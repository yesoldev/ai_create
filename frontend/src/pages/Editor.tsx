import { useEffect, useRef, useState, useCallback, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { Canvas, StaticCanvas, IText, Rect, Circle, type FabricObject } from "fabric";
import JSZip from "jszip";
import { saveTemplate, updateTemplate, savePages, deletePage, type TemplatePage } from "../lib/library";
import { listFolders, withDepth, type Folder } from "../lib/folders";
import { generate, uploadRef, krw } from "../lib/studio";
import { api } from "../lib/api";
import { ConfirmDialog, useDismiss } from "../components/dialogs";

interface EditorState {
  imageUrl?: string;
  w?: number;
  h?: number;
  generationId?: string;
  templateId?: string; // 연결된 프로젝트(템플릿)
  canvasJson?: Record<string, unknown>;
  templateName?: string;
  folderId?: string;
  quality?: string;
  kind?: "banner" | "flyer";
  pages?: TemplatePage[];
}

// 편집기 내부 페이지 표현
interface PageItem {
  id: string | null;
  bgUrl?: string;
  canvasJson: Record<string, unknown> | null;
}

type Fmt = "png" | "jpg";

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function nowHHMM(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => res(el);
    el.onerror = () => rej(new Error("img"));
    el.src = url;
  });
}

// AI 글자 수정 중 표시할 상태(순환)
const AI_STEPS = [
  { icon: "ph:brain-duotone", text: "요청한 내용을 이해하는 중이에요" },
  { icon: "ph:eye-duotone", text: "지금 그림을 살펴보는 중이에요" },
  { icon: "ph:text-aa-duotone", text: "글자를 고치는 중이에요" },
  { icon: "ph:sparkle-duotone", text: "자연스럽게 다듬는 중이에요" },
];

export default function Editor() {
  const nav = useNavigate();
  const loc = useLocation();
  const st = (loc.state || {}) as EditorState;

  const canvasEl = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null); // 현재 페이지 원본(합성용)
  const natSize = useRef({ w: 1024, h: 1024 });
  const history = useRef<string[]>([]);
  const histIndex = useRef(-1);
  const restoring = useRef(false);

  // 페이지들 — pagesRef가 실제 데이터(오버레이 포함), pages는 렌더용 미러
  const initialPages: PageItem[] =
    st.pages && st.pages.length
      ? st.pages.map((p) => ({ id: p.id, bgUrl: p.bg_url ?? undefined, canvasJson: p.canvas_json }))
      : [{ id: null, bgUrl: st.imageUrl, canvasJson: st.canvasJson ?? null }];
  const pagesRef = useRef<PageItem[]>(initialPages);
  const activeRef = useRef(0);
  const [pages, setPages] = useState<PageItem[]>(initialPages);
  const [active, setActive] = useState(0);

  const [ready, setReady] = useState(false);
  const [disp, setDisp] = useState({ w: 0, h: 0 });
  const [bgUrl, setBgUrl] = useState<string | undefined>(initialPages[0].bgUrl);
  const [hasSelection, setHasSelection] = useState(false);
  const [color, setColor] = useState("#111111");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [tplName, setTplName] = useState(st.templateName || "");
  const [saveMsg, setSaveMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<string>(st.folderId || "");
  const [dirty, setDirty] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [lastSaved, setLastSaved] = useState<string>(""); // 마지막 저장 시각 표시
  const [delPageOpen, setDelPageOpen] = useState(false); // 페이지 삭제 확인
  const [moveOpen, setMoveOpen] = useState(false); // 폴더 이동
  const [moveFolderId, setMoveFolderId] = useState("");
  const [moving, setMoving] = useState(false);
  const saveDismiss = useDismiss(() => setShowSave(false));
  const moveDismiss = useDismiss(() => !moving && setMoveOpen(false));
  // AI로 글자 수정/추가
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStep, setAiStep] = useState(0);
  const [aiMsg, setAiMsg] = useState("");
  const [remaining, setRemaining] = useState<number | null | undefined>(undefined); // 이번 달 잔액
  // AI로 크기 변경 (px) — '사이즈 수정' 눌렀을 때만 입력·적용
  const [sizeEdit, setSizeEdit] = useState(false);
  const [aiW, setAiW] = useState(0);
  const [aiH, setAiH] = useState(0);

  useEffect(() => {
    listFolders().then(setFolders).catch(() => {});
    api
      .get<{ remaining_krw: number | null }>("/api/usage/me")
      .then((r) => setRemaining(r.data.remaining_krw))
      .catch(() => {});
  }, []);

  // AI 수정 중 상태 메시지 순환
  useEffect(() => {
    if (!aiBusy) return;
    setAiStep(0);
    const t = setInterval(() => setAiStep((s) => Math.min(s + 1, AI_STEPS.length - 1)), 3500);
    return () => clearInterval(t);
  }, [aiBusy]);

  const snapshot = useCallback(() => {
    if (!fabricRef.current || restoring.current) return;
    const json = JSON.stringify(fabricRef.current.toJSON());
    history.current = history.current.slice(0, histIndex.current + 1);
    history.current.push(json);
    histIndex.current = history.current.length - 1;
    setCanUndo(histIndex.current > 0);
    setCanRedo(false);
    setDirty(true);
  }, []);

  const restore = useCallback(async (json: string) => {
    const c = fabricRef.current;
    if (!c) return;
    restoring.current = true;
    await c.loadFromJSON(json);
    c.renderAll();
    restoring.current = false;
    setCanUndo(histIndex.current > 0);
    setCanRedo(histIndex.current < history.current.length - 1);
  }, []);

  // 지정 페이지를 캔버스에 표시(이전 페이지 오버레이는 pagesRef에 저장)
  const showPage = useCallback(async (idx: number, saveCurrent = true) => {
    const c = fabricRef.current;
    if (!c || idx < 0 || idx >= pagesRef.current.length) return;
    if (saveCurrent && pagesRef.current[activeRef.current]) {
      pagesRef.current[activeRef.current].canvasJson = c.toJSON() as Record<string, unknown>;
    }
    activeRef.current = idx;
    setActive(idx);
    setReady(false);
    restoring.current = true;

    const page = pagesRef.current[idx];
    let natW = natSize.current.w;
    let natH = natSize.current.h;
    bgImgRef.current = null;
    if (page.bgUrl) {
      try {
        const el = await loadImg(page.bgUrl);
        natW = el.naturalWidth || natW;
        natH = el.naturalHeight || natH;
        bgImgRef.current = el;
      } catch {
        /* 배경 없이 진행 */
      }
    }
    if (fabricRef.current !== c) return;
    natSize.current = { w: natW, h: natH };
    setBgUrl(page.bgUrl);

    const maxW = Math.min(window.innerWidth - 48, 900);
    const maxH = window.innerHeight - 260;
    const s = Math.min(maxW / natW, maxH / natH, 1);
    const dispW = Math.round(natW * s);
    const dispH = Math.round(natH * s);
    setDisp({ w: dispW, h: dispH });
    c.setDimensions({ width: natW, height: natH });
    c.setDimensions({ width: `${dispW}px`, height: `${dispH}px` }, { cssOnly: true });

    if (page.canvasJson) {
      try {
        await c.loadFromJSON(page.canvasJson);
      } catch {
        c.clear();
      }
    } else {
      c.clear();
    }
    c.renderAll();

    history.current = [JSON.stringify(c.toJSON())];
    histIndex.current = 0;
    restoring.current = false;
    setReady(true);
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  useEffect(() => {
    if (!canvasEl.current) return;
    const canvas = new Canvas(canvasEl.current, {
      preserveObjectStacking: true,
      enableRetinaScaling: false,
    });
    fabricRef.current = canvas;
    restoring.current = true;

    canvas.on("object:added", snapshot);
    canvas.on("object:modified", snapshot);
    canvas.on("object:removed", snapshot);
    const onSel = () => setHasSelection(!!canvas.getActiveObject());
    canvas.on("selection:created", onSel);
    canvas.on("selection:updated", onSel);
    canvas.on("selection:cleared", () => setHasSelection(false));

    showPage(0, false);

    return () => {
      canvas.dispose();
      if (fabricRef.current === canvas) fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addText() {
    const c = fabricRef.current;
    if (!c) return;
    const { w, h } = natSize.current;
    const t = new IText("두 번 눌러 글자 입력", {
      left: w * 0.1,
      top: h * 0.42,
      fontSize: Math.max(24, Math.round(h * 0.1)),
      fill: color,
      fontFamily: "Pretendard Variable, Pretendard, sans-serif",
      fontWeight: "700",
    });
    c.add(t);
    c.setActiveObject(t);
    c.renderAll();
  }

  function addRect() {
    const c = fabricRef.current;
    if (!c) return;
    const { w, h } = natSize.current;
    const r = new Rect({
      left: w * 0.35, top: h * 0.4, width: w * 0.3, height: h * 0.2,
      fill: "rgba(0,0,0,0)", stroke: color, strokeWidth: Math.max(3, Math.round(h * 0.008)),
    });
    c.add(r);
    c.setActiveObject(r);
    c.renderAll();
  }

  function addCircle() {
    const c = fabricRef.current;
    if (!c) return;
    const { w, h } = natSize.current;
    const o = new Circle({
      left: w * 0.4, top: h * 0.35, radius: Math.min(w, h) * 0.15,
      fill: "rgba(0,0,0,0)", stroke: color, strokeWidth: Math.max(3, Math.round(h * 0.008)),
    });
    c.add(o);
    c.setActiveObject(o);
    c.renderAll();
  }

  function applyColor(hex: string) {
    setColor(hex);
    const c = fabricRef.current;
    const obj = c?.getActiveObject() as FabricObject | undefined;
    if (!c || !obj) return;
    if (obj.type === "i-text") obj.set("fill", hex);
    else obj.set("stroke", hex);
    c.renderAll();
    snapshot();
  }

  function fillSel() {
    const c = fabricRef.current;
    const obj = c?.getActiveObject() as FabricObject | undefined;
    if (!c || !obj || obj.type === "i-text") return;
    obj.set("fill", color);
    c.renderAll();
    snapshot();
  }

  function resizeText(factor: number) {
    const c = fabricRef.current;
    const obj = c?.getActiveObject() as (FabricObject & { fontSize?: number }) | undefined;
    if (!c || !obj || obj.type !== "i-text") return;
    obj.set("fontSize", Math.max(8, Math.round((obj.fontSize || 24) * factor)));
    c.renderAll();
    snapshot();
  }

  function removeSel() {
    const c = fabricRef.current;
    if (!c) return;
    c.getActiveObjects().forEach((o) => c.remove(o));
    c.discardActiveObject();
    c.renderAll();
  }

  function undo() {
    if (histIndex.current <= 0) return;
    histIndex.current -= 1;
    restore(history.current[histIndex.current]);
  }
  function redo() {
    if (histIndex.current >= history.current.length - 1) return;
    histIndex.current += 1;
    restore(history.current[histIndex.current]);
  }

  // 현재 페이지 오버레이를 pagesRef에 반영
  function syncActive() {
    const c = fabricRef.current;
    if (c && pagesRef.current[activeRef.current]) {
      pagesRef.current[activeRef.current].canvasJson = c.toJSON() as Record<string, unknown>;
    }
  }

  // 페이지 오버레이 자동 저장(조용히) — 페이지 추가/변경 시
  async function autoSavePages() {
    if (!st.templateId) return;
    syncActive();
    const withId = pagesRef.current.filter((p) => p.id) as { id: string; canvasJson: Record<string, unknown> | null }[];
    if (!withId.length) return;
    try {
      await savePages(st.templateId, withId.map((p) => ({ id: p.id, canvas_json: p.canvasJson ?? {} })));
      setLastSaved(nowHHMM());
      setDirty(false);
    } catch {
      /* 자동 저장 실패는 조용히 무시(수동 저장으로 보완) */
    }
  }

  const baseName = () => (tplName.trim() || st.templateName || "홍보물");

  // 현재 페이지 저장(원본 해상도 합성)
  function save(format: Fmt) {
    const c = fabricRef.current;
    if (!c) return;
    c.discardActiveObject();
    c.renderAll();
    const { w, h } = natSize.current;
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d")!;
    if (format === "jpg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    if (bgImgRef.current) ctx.drawImage(bgImgRef.current, 0, 0, w, h);
    ctx.drawImage(c.lowerCanvasEl, 0, 0, w, h);
    const url = off.toDataURL(format === "jpg" ? "image/jpeg" : "image/png", 0.92);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName()}_${active + 1}.${format}`;
    a.click();
  }

  // 한 페이지를 원본 해상도로 합성한 Blob
  async function renderPageBlob(page: PageItem, format: Fmt): Promise<Blob> {
    let w = natSize.current.w;
    let h = natSize.current.h;
    let bgEl: HTMLImageElement | null = null;
    if (page.bgUrl) {
      try {
        bgEl = await loadImg(page.bgUrl);
        w = bgEl.naturalWidth || w;
        h = bgEl.naturalHeight || h;
      } catch {
        bgEl = null;
      }
    }
    const scEl = document.createElement("canvas");
    const sc = new StaticCanvas(scEl, { width: w, height: h, enableRetinaScaling: false });
    if (page.canvasJson) {
      try {
        await sc.loadFromJSON(page.canvasJson);
      } catch {
        /* 오버레이 없이 */
      }
    }
    sc.renderAll();
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d")!;
    if (format === "jpg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    if (bgEl) ctx.drawImage(bgEl, 0, 0, w, h);
    ctx.drawImage(sc.lowerCanvasEl, 0, 0, w, h);
    sc.dispose();
    return await new Promise<Blob>((r) =>
      off.toBlob((b) => r(b!), format === "jpg" ? "image/jpeg" : "image/png", 0.92),
    );
  }

  const [zipBusy, setZipBusy] = useState(false);

  // 전체 페이지를 ZIP 하나로 다운로드
  async function downloadAll(format: Fmt) {
    if (zipBusy) return;
    setZipBusy(true);
    try {
      syncActive();
      const zip = new JSZip();
      const base = baseName();
      for (let i = 0; i < pagesRef.current.length; i++) {
        const blob = await renderPageBlob(pagesRef.current[i], format);
        zip.file(`${base}_${i + 1}.${format}`, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = `${base}_${today()}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setSaveMsg("전체 다운로드에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setZipBusy(false);
    }
  }

  async function deleteCurrentPage() {
    if (pagesRef.current.length <= 1) return;
    const idx = activeRef.current;
    const p = pagesRef.current[idx];
    if (p.id && st.templateId) {
      try {
        await deletePage(st.templateId, p.id);
      } catch {
        /* 무시 */
      }
    }
    const next = pagesRef.current.filter((_, i) => i !== idx);
    pagesRef.current = next;
    setPages([...next]);
    setDirty(true);
    await showPage(Math.min(idx, next.length - 1), false);
  }

  // AI로 이미지의 글자를 수정/추가 — 현재 페이지를 참고해 '새 페이지'로 추가
  async function runAiEdit() {
    const cur = natSize.current;
    // 사이즈 수정이 켜지고 값이 입력됐을 때만 크기 변경 적용
    const targetW = sizeEdit && aiW > 0 ? Math.round(aiW) : cur.w;
    const targetH = sizeEdit && aiH > 0 ? Math.round(aiH) : cur.h;
    const sizeChanged = targetW !== cur.w || targetH !== cur.h;
    if ((!aiText.trim() && !sizeChanged) || aiBusy) return;
    setAiBusy(true);
    setAiMsg("");
    try {
      // 현재 페이지 이미지를 참고로 업로드(디자인 유지)
      let refUploadId: string | undefined;
      if (bgUrl) {
        try {
          const blob = await (await fetch(bgUrl)).blob();
          refUploadId = await uploadRef(new File([blob], "ref.png", { type: blob.type || "image/png" }));
        } catch {
          refUploadId = undefined;
        }
      }
      // 요청/크기 유무에 따라 프롬프트 구성
      let prompt = "이 참고 이미지를 바탕으로 다시 만들어줘. 원래 디자인·구도·색·내용을 최대한 그대로 유지해.";
      if (aiText.trim()) {
        prompt +=
          ` 아래 요청만 반영해: "${aiText.trim()}". ` +
          "요청은 그림에 그대로 적는 글자가 아니라 '무엇을 어떻게 바꾸거나 더할지'에 대한 지시다. 화살표(→)나 지시문 자체를 그림에 쓰지 마.";
      }
      if (sizeChanged) {
        prompt += ` 이미지 크기를 ${targetW}x${targetH} 픽셀로 바꾸되, 원래 디자인과 내용을 유지하며 새 크기·비율에 자연스럽게 다시 배치해줘.`;
      }
      prompt += " 없는 정보는 지어내지 마.";

      const r = await generate({
        prompt,
        width: targetW,
        height: targetH,
        quality: st.quality || "medium",
        mode: "ai_text",
        kind: st.kind,
        ref_upload_id: refUploadId,
        template_id: st.templateId,
        similarity: 4,
      });
      // 새 페이지로 추가하고 그 페이지로 이동
      const next = [...pagesRef.current, { id: r.page_id ?? null, bgUrl: r.image_url, canvasJson: null }];
      pagesRef.current = next;
      setPages([...next]);
      setDirty(true);
      setRemaining(r.remaining_krw);
      setAiOpen(false);
      setAiText("");
      await showPage(next.length - 1);
      await autoSavePages(); // 새 페이지 자동 저장
      setSaveMsg(
        `AI가 새 페이지를 만들었어요. 이번에 ${krw(r.cost_krw)} 썼어요` +
          (r.remaining_krw === null ? " (잔액 무제한)." : ` · 이번 달 남은 금액 ${krw(r.remaining_krw)}.`),
      );
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { detail?: string } } };
      const detail = err?.response?.data?.detail;
      setAiMsg(
        err?.response?.status === 402
          ? "이번 달 사용할 수 있는 금액을 넘었어요. 관리자에게 문의하세요."
          : detail
            ? `AI 수정 실패: ${detail}`
            : "AI 수정에 실패했어요. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setAiBusy(false);
    }
  }

  async function doSaveTemplate(e: FormEvent) {
    e.preventDefault();
    if (!tplName.trim()) return;
    syncActive();
    setSaving(true);
    setSaveMsg("");
    try {
      if (st.templateId) {
        await updateTemplate(st.templateId, {
          name: tplName.trim(),
          folder_id: folderId || null,
          move_to_root: !folderId,
        });
        const withId = pagesRef.current.filter((p) => p.id) as { id: string; canvasJson: Record<string, unknown> | null }[];
        if (withId.length) {
          await savePages(
            st.templateId,
            withId.map((p) => ({ id: p.id, canvas_json: p.canvasJson ?? {} })),
          );
        }
      } else {
        await saveTemplate({
          name: tplName.trim(),
          canvas_json: pagesRef.current[0].canvasJson ?? {},
          size_w: natSize.current.w,
          size_h: natSize.current.h,
          generation_id: st.generationId,
          folder_id: folderId || null,
        });
      }
      setShowSave(false);
      setDirty(false);
      setLastSaved(nowHHMM());
      setSaveMsg("보관함에 저장했어요.");
    } catch {
      setSaveMsg("저장에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  function tryLeave() {
    if (dirty) setLeaveOpen(true);
    else nav("/library");
  }
  function doLeave() {
    setLeaveOpen(false);
    setDirty(false);
    nav("/library");
  }

  // 폴더 이동
  async function doMoveFolder() {
    if (!st.templateId) {
      setMoveOpen(false);
      return;
    }
    setMoving(true);
    try {
      await updateTemplate(st.templateId, { folder_id: moveFolderId || null, move_to_root: !moveFolderId });
      setFolderId(moveFolderId);
      setMoveOpen(false);
      setSaveMsg("폴더를 옮겼어요.");
    } catch {
      setSaveMsg("폴더 이동에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setMoving(false);
    }
  }
  async function saveThenLeave() {
    syncActive();
    if (st.templateId) {
      try {
        const withId = pagesRef.current.filter((p) => p.id) as { id: string; canvasJson: Record<string, unknown> | null }[];
        if (withId.length) {
          await savePages(st.templateId, withId.map((p) => ({ id: p.id, canvas_json: p.canvasJson ?? {} })));
        }
      } catch {
        /* 무시하고 진행 */
      }
      doLeave();
    } else {
      setLeaveOpen(false);
      setShowSave(true);
    }
  }

  const btn =
    "flex h-12 items-center gap-1.5 rounded-xl px-3 text-base font-semibold transition disabled:opacity-40";
  const tool = `${btn} border-2 border-neutral-200 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800`;

  return (
    <div className="flex min-h-screen flex-col bg-neutral-100 dark:bg-neutral-950">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <button onClick={tryLeave} className={tool}>
          <Icon icon="ph:arrow-left-bold" /> 뒤로
        </button>
        <div className="flex items-center gap-2 font-semibold">
          <Icon icon="ph:pencil-simple-duotone" className="text-emerald-600 text-[20px]" /> 편집기
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lastSaved && <span className="text-xs text-neutral-400">마지막 저장 {lastSaved}</span>}
          <button onClick={() => setShowSave(true)} className={`${btn} border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30`}>
            <Icon icon="ph:floppy-disk-bold" /> 보관함에 저장
          </button>
          <button
            onClick={() => {
              if (!st.templateId) { setShowSave(true); return; }
              setMoveFolderId(folderId);
              setMoveOpen(true);
            }}
            className={`${btn} border-2 border-neutral-200 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800`}
          >
            <Icon icon="ph:folder-simple-bold" /> 폴더 이동
          </button>
          <button
            onClick={() => {
              setAiMsg("");
              setSizeEdit(false);
              setAiW(natSize.current.w);
              setAiH(natSize.current.h);
              setAiOpen(true);
            }}
            className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`}
          >
            <Icon icon="ph:magic-wand-bold" /> AI로 수정
          </button>
          <button onClick={() => save("png")} className={`${btn} bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200`}>
            <Icon icon="ph:download-simple-bold" /> PNG
          </button>
          <button onClick={() => save("jpg")} className={`${btn} bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200`}>
            <Icon icon="ph:download-simple-bold" /> JPG
          </button>
          {pages.length > 1 && (
            <button onClick={() => downloadAll("png")} disabled={zipBusy} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`}>
              <Icon icon={zipBusy ? "ph:spinner-gap-bold" : "ph:package-bold"} className={zipBusy ? "animate-spin" : ""} /> 전체 ZIP
            </button>
          )}
        </div>
      </header>

      {saveMsg && (
        <div className="bg-emerald-50 px-4 py-2 text-center text-base text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          {saveMsg}
        </div>
      )}

      <ConfirmDialog
        open={leaveOpen}
        icon="ph:floppy-disk-duotone"
        title="저장하시겠습니까?"
        desc="지금까지 바꾼 내용을 보관함에 저장할 수 있어요."
        onClose={() => setLeaveOpen(false)}
        actions={[
          { label: "저장하고 나가기", tone: "primary", icon: "ph:check-bold", onClick: saveThenLeave },
          { label: "저장 안 하고 나가기", tone: "ghost", icon: "ph:x-bold", onClick: doLeave },
          { label: "취소 (계속 편집)", tone: "soft", onClick: () => setLeaveOpen(false) },
        ]}
      />

      <ConfirmDialog
        open={delPageOpen}
        icon="ph:trash-duotone"
        title="이 페이지를 삭제할까요?"
        desc={`${active + 1}페이지가 지워져요. 되돌릴 수 없어요.`}
        onClose={() => setDelPageOpen(false)}
        actions={[
          {
            label: "삭제",
            tone: "danger",
            icon: "ph:trash-bold",
            onClick: () => {
              setDelPageOpen(false);
              deleteCurrentPage();
            },
          },
          { label: "취소", tone: "soft", onClick: () => setDelPageOpen(false) },
        ]}
      />

      {moveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...moveDismiss}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-neutral-900">
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Icon icon="ph:folder-simple-duotone" className="text-emerald-600 text-[24px]" />
              폴더 이동
            </h2>
            <p className="mt-1 text-base text-neutral-500 dark:text-neutral-400">이 프로젝트를 옮길 폴더를 골라 주세요.</p>
            <select
              value={moveFolderId}
              onChange={(e) => setMoveFolderId(e.target.value)}
              className="mt-4 h-12 w-full rounded-xl border-2 border-neutral-200 px-3 text-lg outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-800"
            >
              <option value="">폴더 없음</option>
              {withDepth(folders).map((f) => (
                <option key={f.id} value={f.id}>
                  {" ".repeat(f.depth * 2)}
                  {f.name}
                </option>
              ))}
            </select>
            <div className="mt-5 flex gap-2">
              <button onClick={doMoveFolder} disabled={moving} className={`${btn} flex-1 justify-center bg-emerald-600 text-white hover:bg-emerald-500`}>
                <Icon icon="ph:check-bold" /> {moving ? "옮기는 중..." : "옮기기"}
              </button>
              <button onClick={() => setMoveOpen(false)} disabled={moving} className={`${btn} justify-center border-2 border-neutral-200 dark:border-neutral-700`}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {showSave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...saveDismiss}>
          <form
            onSubmit={doSaveTemplate}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-neutral-900"
          >
            <h2 className="text-xl font-bold">보관함에 저장</h2>
            <p className="mt-1 text-base text-neutral-500 dark:text-neutral-400">이름을 정해 두면 나중에 다시 꺼내 쓸 수 있어요.</p>
            <input
              autoFocus
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="예) 봄맞이 할인 배너"
              className="mt-4 h-12 w-full rounded-xl border-2 border-neutral-200 px-4 text-lg outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-800"
            />
            <label className="mt-3 block text-base font-semibold">폴더</label>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="mt-1 h-12 w-full rounded-xl border-2 border-neutral-200 px-3 text-lg outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-800"
            >
              <option value="">폴더 없음</option>
              {withDepth(folders).map((f) => (
                <option key={f.id} value={f.id}>
                  {" ".repeat(f.depth * 2)}
                  {f.name}
                </option>
              ))}
            </select>
            <div className="mt-5 flex gap-2">
              <button type="submit" disabled={saving || !tplName.trim()} className={`${btn} flex-1 justify-center bg-emerald-600 text-white hover:bg-emerald-500`}>
                <Icon icon="ph:check-bold" /> {saving ? "저장 중..." : "저장"}
              </button>
              <button type="button" onClick={() => setShowSave(false)} className={`${btn} justify-center border-2 border-neutral-200 dark:border-neutral-700`}>
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <button onClick={addText} className={tool}><Icon icon="ph:text-t-bold" /> 글자 넣기</button>
        <button onClick={addRect} className={tool}><Icon icon="ph:square-bold" /> 네모</button>
        <button onClick={addCircle} className={tool}><Icon icon="ph:circle-bold" /> 동그라미</button>
        <label className={`${tool} cursor-pointer`}>
          <Icon icon="ph:palette-bold" /> 색
          <input type="color" value={color} onChange={(e) => applyColor(e.target.value)} className="ml-1 h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0" />
        </label>
        <button onClick={fillSel} disabled={!hasSelection} className={tool}><Icon icon="ph:paint-bucket-bold" /> 채우기</button>
        <button onClick={() => resizeText(1.2)} disabled={!hasSelection} className={tool}><Icon icon="ph:text-aa-bold" /> 크게</button>
        <button onClick={() => resizeText(0.85)} disabled={!hasSelection} className={tool}><Icon icon="ph:text-t-bold" /> 작게</button>
        <button onClick={removeSel} disabled={!hasSelection} className={tool}><Icon icon="ph:trash-bold" /> 삭제</button>
        <div className="mx-1 h-8 w-px bg-neutral-200 dark:bg-neutral-700" />
        <button onClick={undo} disabled={!canUndo} className={tool}><Icon icon="ph:arrow-counter-clockwise-bold" /> 되돌리기</button>
        <button onClick={redo} disabled={!canRedo} className={tool}><Icon icon="ph:arrow-clockwise-bold" /> 다시</button>
      </div>

      {/* 페이지 바 */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-neutral-200 bg-neutral-50 px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900/60">
        <span className="shrink-0 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
          페이지 {active + 1}/{pages.length}
        </span>
        {pages.map((p, i) => (
          <button
            key={p.id ?? `p${i}`}
            onClick={() => showPage(i)}
            className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${
              i === active ? "border-emerald-500 ring-2 ring-emerald-500/30" : "border-neutral-200 dark:border-neutral-700"
            }`}
            title={`${i + 1}페이지`}
          >
            {p.bgUrl ? (
              <img src={p.bgUrl} alt={`${i + 1}페이지`} className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full place-items-center text-neutral-300"><Icon icon="ph:image-duotone" /></span>
            )}
            <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[10px] font-bold text-white">{i + 1}</span>
          </button>
        ))}
        {pages.length > 1 && (
          <button onClick={() => setDelPageOpen(true)} className={`${tool} h-10 shrink-0`}>
            <Icon icon="ph:trash-bold" /> 이 페이지 삭제
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 캔버스 영역 */}
        <div className="flex min-w-0 flex-1 flex-col overflow-auto">
          <div className="flex flex-1 items-center justify-center p-6">
            <div
              className="relative rounded-lg bg-white shadow-xl"
              style={{
                opacity: ready ? 1 : 0,
                width: disp.w || undefined,
                height: disp.h || undefined,
                backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
                backgroundSize: "100% 100%",
              }}
            >
              <canvas ref={canvasEl} className="absolute inset-0" />
            </div>
          </div>
          {!bgUrl && ready && (
            <p className="pb-4 text-center text-base text-neutral-500">
              편집할 그림이 없어요. 먼저 홍보물을 만든 뒤 "글자 수정 또는 추가"로 여세요.
            </p>
          )}
        </div>

        {/* AI 글자 수정 — 우측 패널(이미지를 가리지 않도록) */}
        {aiOpen && (
          <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-neutral-200 bg-white p-5 sm:w-96 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Icon icon="ph:magic-wand-duotone" className="text-emerald-600 text-[24px]" />
                AI로 수정
              </h2>
              <button onClick={() => !aiBusy && setAiOpen(false)} disabled={aiBusy} className="grid h-9 w-9 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800">
                <Icon icon="ph:x-bold" />
              </button>
            </div>

            {remaining !== undefined && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-base text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                <Icon icon="ph:wallet-duotone" className="text-[20px]" />
                이번 달 남은 금액: <b>{krw(remaining)}</b>
              </div>
            )}

            {aiBusy ? (
              <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
                <Icon icon="ph:spinner-gap-bold" className="animate-spin text-5xl text-emerald-500" />
                <p className="mt-5 flex items-center gap-2 text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                  <Icon icon={AI_STEPS[Math.min(aiStep, AI_STEPS.length - 1)].icon} className="text-[22px]" />
                  {AI_STEPS[Math.min(aiStep, AI_STEPS.length - 1)].text}
                </p>
                <p className="mt-2 text-base text-neutral-500 dark:text-neutral-400">30초쯤 걸려요. 잠시만 기다려 주세요.</p>
                <div className="mt-4 flex gap-2">
                  {AI_STEPS.map((_, i) => (
                    <span key={i} className={`h-2.5 w-2.5 rounded-full ${i <= aiStep ? "bg-emerald-500" : "bg-neutral-200 dark:bg-neutral-700"}`} />
                  ))}
                </div>
              </div>
            ) : (
              <>
                <p className="mt-1 text-base text-neutral-500 dark:text-neutral-400">
                  지금 그림을 참고해 어떻게 바꿀지 적어 주세요. 글자·색·배치 등 무엇이든 요청할 수 있어요. 결과는 <b>새 페이지</b>로 추가돼요.
                </p>
                <textarea
                  autoFocus
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  rows={6}
                  placeholder={"예)\n'목적'을 '매물'로 바꿔줘\n배경을 더 밝은 파란색으로\n맨 아래에 전화번호 010-1234-5678 추가해줘"}
                  className="mt-4 w-full rounded-xl border-2 border-neutral-200 p-3 text-lg outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-800"
                />
                {/* 사이즈 수정 — 누르면 입력칸 표시, 입력해 현재와 다를 때만 적용 */}
                <button
                  type="button"
                  onClick={() => setSizeEdit((v) => !v)}
                  className={`mt-4 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border-2 text-base font-semibold transition ${
                    sizeEdit
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                      : "border-neutral-200 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  }`}
                >
                  <Icon icon="ph:frame-corners-bold" /> 사이즈 수정
                </button>
                {sizeEdit && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={16}
                        max={3840}
                        value={aiW || ""}
                        onChange={(e) => setAiW(Number(e.target.value))}
                        className="h-11 w-24 rounded-xl border-2 border-neutral-200 px-3 text-lg outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-800"
                      />
                      <span className="text-lg text-neutral-400">×</span>
                      <input
                        type="number"
                        min={16}
                        max={3840}
                        value={aiH || ""}
                        onChange={(e) => setAiH(Number(e.target.value))}
                        className="h-11 w-24 rounded-xl border-2 border-neutral-200 px-3 text-lg outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-800"
                      />
                      <span className="text-lg text-neutral-500">px</span>
                    </div>
                    <p className="mt-1 text-sm text-neutral-400">
                      지금 {natSize.current.w}×{natSize.current.h}px · 비율이 크게 달라지면 배치가 바뀔 수 있어요
                    </p>
                  </div>
                )}
                {aiMsg && <p className="mt-2 text-base text-red-600 dark:text-red-400">{aiMsg}</p>}
                <button
                  onClick={runAiEdit}
                  disabled={
                    !aiText.trim() &&
                    !(sizeEdit && aiW > 0 && aiH > 0 && (aiW !== natSize.current.w || aiH !== natSize.current.h))
                  }
                  className={`${btn} mt-4 w-full justify-center bg-emerald-600 text-white hover:bg-emerald-500`}
                >
                  <Icon icon="ph:magic-wand-bold" /> AI로 수정하기
                </button>
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
