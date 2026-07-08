import { useEffect, useRef, useState, useCallback, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { Canvas, IText, Rect, Circle, type FabricObject } from "fabric";
import { saveTemplate, updateTemplate } from "../lib/library";
import { listFolders, withDepth, type Folder } from "../lib/folders";
import { generate, uploadRef, krw } from "../lib/studio";
import { ConfirmDialog } from "../components/dialogs";

interface EditorState {
  imageUrl?: string;
  w?: number;
  h?: number;
  generationId?: string;
  templateId?: string; // 연결된 프로젝트(템플릿)
  canvasJson?: Record<string, unknown>;
  templateName?: string;
  quality?: string;
  kind?: "banner" | "flyer";
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export default function Editor() {
  const nav = useNavigate();
  const loc = useLocation();
  const st = (loc.state || {}) as EditorState;

  const canvasEl = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null); // 원본 이미지(합성용)
  const genIdRef = useRef<string | undefined>(st.generationId); // AI 수정 시 참고할 최신 생성 id
  const natSize = useRef({ w: 1024, h: 1024 });
  const history = useRef<string[]>([]);
  const histIndex = useRef(-1);
  const restoring = useRef(false);

  const [ready, setReady] = useState(false);
  const [disp, setDisp] = useState({ w: 0, h: 0 });
  const [hasSelection, setHasSelection] = useState(false);
  const [color, setColor] = useState("#111111");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [tplName, setTplName] = useState(st.templateName || "");
  const [saveMsg, setSaveMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  // AI로 글자 수정/추가
  const [bgUrl, setBgUrl] = useState<string | undefined>(st.imageUrl);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState("");

  useEffect(() => {
    listFolders().then(setFolders).catch(() => {});
  }, []);

  // AI로 이미지의 글자를 수정/추가 — 현재 이미지를 참고해 다시 생성하고 배경을 교체
  async function runAiEdit() {
    if (!aiText.trim() || aiBusy) return;
    setAiBusy(true);
    setAiMsg("");
    try {
      const { w, h } = natSize.current;
      // 참고 이미지: 생성물 id가 있으면 그대로, 없으면(프로젝트로 연 경우) 현재 이미지를 업로드해 참고
      let refGenerationId = genIdRef.current;
      let refUploadId: string | undefined;
      if (!refGenerationId && bgUrl) {
        try {
          const blob = await (await fetch(bgUrl)).blob();
          refUploadId = await uploadRef(new File([blob], "ref.png", { type: blob.type || "image/png" }));
        } catch {
          refGenerationId = undefined; // 참고 없이 진행
        }
      }
      const r = await generate({
        prompt:
          "참고 이미지와 똑같은 디자인·구도·색을 최대한 그대로 유지하면서, " +
          "아래 한글 문구로 글자만 자연스럽게 바꾸거나 추가해줘. 없는 정보는 지어내지 마.",
        width: w,
        height: h,
        quality: st.quality || "medium",
        mode: "ai_text",
        text_content: aiText.trim(),
        kind: st.kind,
        ref_generation_id: refGenerationId,
        ref_upload_id: refUploadId,
        template_id: st.templateId,
        similarity: 3,
      });
      // 새 이미지를 배경으로 교체(원본 해상도 합성용 이미지도 갱신)
      const el = new Image();
      el.crossOrigin = "anonymous";
      await new Promise<void>((res, rej) => {
        el.onload = () => res();
        el.onerror = () => rej(new Error("img"));
        el.src = r.image_url;
      });
      bgImgRef.current = el;
      genIdRef.current = r.generation_id;
      setBgUrl(r.image_url);
      setDirty(true);
      setAiOpen(false);
      setAiText("");
      setAiMsg(`AI가 글자를 수정했어요. 이번에 ${krw(r.cost_krw)} 썼어요.`);
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setAiMsg(
        status === 402
          ? "이번 달 사용할 수 있는 금액을 넘었어요. 관리자에게 문의하세요."
          : "AI 수정에 실패했어요. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setAiBusy(false);
    }
  }

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

  useEffect(() => {
    if (!canvasEl.current) return;
    // 투명 오버레이 캔버스 (AI 이미지는 CSS 배경으로 깔고, Fabric은 글자/도형만)
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

    (async () => {
      let natW = st.w || 1024;
      let natH = st.h || 1024;
      if (st.imageUrl) {
        try {
          const el = new Image();
          el.crossOrigin = "anonymous";
          await new Promise<void>((res, rej) => {
            el.onload = () => res();
            el.onerror = () => rej(new Error("img"));
            el.src = st.imageUrl!;
          });
          natW = el.naturalWidth || natW;
          natH = el.naturalHeight || natH;
          bgImgRef.current = el;
        } catch {
          /* 배경 없이 진행 */
        }
      }
      if (fabricRef.current !== canvas) return;
      natSize.current = { w: natW, h: natH };

      const maxW = Math.min(window.innerWidth - 48, 900);
      const maxH = window.innerHeight - 200;
      const s = Math.min(maxW / natW, maxH / natH, 1);
      const dispW = Math.round(natW * s);
      const dispH = Math.round(natH * s);
      setDisp({ w: dispW, h: dispH });

      canvas.setDimensions({ width: natW, height: natH }); // 백킹 = 원본
      canvas.setDimensions({ width: `${dispW}px`, height: `${dispH}px` }, { cssOnly: true });

      // 템플릿에서 열었으면 저장된 오버레이(글자/도형) 복원
      if (st.canvasJson) {
        try {
          await canvas.loadFromJSON(st.canvasJson);
        } catch {
          /* 무시 */
        }
      }
      canvas.renderAll();

      history.current = [JSON.stringify(canvas.toJSON())];
      histIndex.current = 0;
      restoring.current = false;
      setReady(true);
      setCanUndo(false);
      setCanRedo(false);
    })();

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

  // 도형을 현재 색으로 꽉 채우기(깨진 AI 글자를 덮을 때 유용)
  function fillSel() {
    const c = fabricRef.current;
    const obj = c?.getActiveObject() as FabricObject | undefined;
    if (!c || !obj || obj.type === "i-text") return;
    obj.set("fill", color);
    c.renderAll();
    snapshot();
  }

  // 선택한 글자 크기 조절
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

  function save(format: "png" | "jpg") {
    const c = fabricRef.current;
    if (!c) return;
    c.discardActiveObject();
    c.renderAll();
    const { w, h } = natSize.current;
    // 원본 이미지 + 오버레이를 원본 해상도로 합성
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d")!;
    if (format === "jpg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    if (bgImgRef.current) ctx.drawImage(bgImgRef.current, 0, 0, w, h);
    ctx.drawImage(c.lowerCanvasEl, 0, 0, w, h); // 오버레이(투명 배경) 위에 얹기
    const url = off.toDataURL(format === "jpg" ? "image/jpeg" : "image/png", 0.92);
    const a = document.createElement("a");
    a.href = url;
    a.download = `홍보물_${today()}.${format}`;
    a.click();
  }

  async function doSaveTemplate(e: FormEvent) {
    e.preventDefault();
    const c = fabricRef.current;
    if (!c || !tplName.trim()) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const canvas = c.toJSON() as Record<string, unknown>;
      if (st.templateId) {
        await updateTemplate(st.templateId, { name: tplName.trim(), canvas_json: canvas, folder_id: folderId || null, move_to_root: !folderId });
      } else {
        await saveTemplate({
          name: tplName.trim(),
          canvas_json: canvas,
          size_w: natSize.current.w,
          size_h: natSize.current.h,
          generation_id: st.generationId,
          folder_id: folderId || null,
        });
      }
      setShowSave(false);
      setDirty(false);
      setSaveMsg("보관함에 저장했어요.");
    } catch {
      setSaveMsg("저장에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  // 나가기 처리 — 변경사항 있으면 확인
  function tryLeave() {
    if (dirty) setLeaveOpen(true);
    else nav(-1);
  }
  function doLeave() {
    setLeaveOpen(false);
    setDirty(false);
    nav(-1);
  }
  async function saveThenLeave() {
    const c = fabricRef.current;
    if (c && st.templateId) {
      try {
        await updateTemplate(st.templateId, { canvas_json: c.toJSON() as Record<string, unknown> });
      } catch {
        /* 무시하고 진행 */
      }
      doLeave();
    } else {
      // 연결된 프로젝트가 없으면 이름 정해 저장
      setLeaveOpen(false);
      setShowSave(true);
    }
  }

  const btn =
    "flex h-12 items-center gap-1.5 rounded-xl px-3 text-base font-semibold transition disabled:opacity-40";
  const tool = `${btn} border-2 border-neutral-200 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800`;

  return (
    <div className="flex min-h-screen flex-col bg-neutral-100 dark:bg-neutral-950">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <button onClick={tryLeave} className={tool}>
          <Icon icon="ph:arrow-left-bold" /> 뒤로
        </button>
        <div className="flex items-center gap-2 font-semibold">
          <Icon icon="ph:pencil-simple-duotone" className="text-emerald-600 text-[20px]" /> 편집기
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setAiMsg(""); setAiOpen(true); }} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`}>
            <Icon icon="ph:magic-wand-bold" /> AI로 글자 수정
          </button>
          <button onClick={() => setShowSave(true)} className={`${btn} border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30`}>
            <Icon icon="ph:floppy-disk-bold" /> 보관함에 저장
          </button>
          <button onClick={() => save("png")} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`}>
            <Icon icon="ph:download-simple-bold" /> PNG
          </button>
          <button onClick={() => save("jpg")} className={`${btn} bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200`}>
            <Icon icon="ph:download-simple-bold" /> JPG
          </button>
        </div>
      </header>

      {saveMsg && (
        <div className="bg-emerald-50 px-4 py-2 text-center text-base text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          {saveMsg}
        </div>
      )}
      {aiMsg && !aiOpen && (
        <div className="bg-emerald-50 px-4 py-2 text-center text-base text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          {aiMsg}
        </div>
      )}

      {/* AI로 글자 수정/추가 */}
      {aiOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !aiBusy && setAiOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-neutral-900">
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Icon icon="ph:magic-wand-duotone" className="text-emerald-600 text-[24px]" />
              AI로 글자 수정 또는 추가
            </h2>
            <p className="mt-1 text-base text-neutral-500 dark:text-neutral-400">
              AI로 수정될 문구, 추가할 문구를 입력해 주세요. 지금 그림과 비슷하게 다시 만들어요.
            </p>
            <textarea
              autoFocus
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              rows={5}
              placeholder={"예)\n봄맞이 30% 할인\n3월 한 달간"}
              className="mt-4 w-full rounded-xl border-2 border-neutral-200 p-3 text-lg outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-800"
            />
            {aiMsg && <p className="mt-2 text-base text-red-600 dark:text-red-400">{aiMsg}</p>}
            <div className="mt-5 flex gap-2">
              <button
                onClick={runAiEdit}
                disabled={aiBusy || !aiText.trim()}
                className={`${btn} flex-1 justify-center bg-emerald-600 text-white hover:bg-emerald-500`}
              >
                <Icon icon={aiBusy ? "ph:spinner-gap-bold" : "ph:magic-wand-bold"} className={aiBusy ? "animate-spin" : ""} />
                {aiBusy ? "AI가 만드는 중..." : "AI로 수정하기"}
              </button>
              <button onClick={() => setAiOpen(false)} disabled={aiBusy} className={`${btn} justify-center border-2 border-neutral-200 dark:border-neutral-700`}>
                취소
              </button>
            </div>
          </div>
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

      {showSave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowSave(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
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
                  {" ".repeat(f.depth * 2)}
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

      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
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
  );
}
