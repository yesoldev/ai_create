import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { listTemplates, getTemplate, deleteTemplate, uploadProject, type TemplateListItem } from "../lib/library";
import { listFolders, createFolder, deleteFolder, withDepth, type Folder } from "../lib/folders";
import { InputDialog, ConfirmDialog, useDismiss } from "../components/dialogs";

export default function Library() {
  const nav = useNavigate();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [items, setItems] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(""); // 제목 검색어
  const [opening, setOpening] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; desc?: string; onYes: () => void } | null>(null);
  const [newOpen, setNewOpen] = useState(false); // 새 프로젝트 선택 모달
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const newDismiss = useDismiss(() => !uploading && setNewOpen(false));

  async function doUpload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const r = await uploadProject(file, sel);
      nav("/editor", {
        state: {
          imageUrl: r.image_url,
          w: r.size_w,
          h: r.size_h,
          templateId: r.project_id,
          templateName: r.name,
          folderId: sel ?? "",
          pages: [{ id: r.page_id, sort_order: 0, bg_url: r.image_url, canvas_json: null }],
        },
      });
    } catch {
      alert("이미지를 올리지 못했어요. png/jpg 파일인지 확인해 주세요.");
    } finally {
      setUploading(false);
      setNewOpen(false);
    }
  }

  async function loadFolders() {
    try {
      setFolders(await listFolders());
    } catch {
      /* ignore */
    }
  }
  async function loadTemplates(folderId: string | null) {
    setLoading(true);
    try {
      setItems(await listTemplates(folderId));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadFolders();
    loadTemplates(null);
  }, []);

  function pick(id: string | null) {
    setSel(id);
    loadTemplates(id);
  }

  async function addFolder(name: string) {
    await createFolder(name, sel);
    setNewFolderOpen(false);
    loadFolders();
  }

  function askRemoveFolder(f: Folder) {
    setConfirm({
      title: `폴더 "${f.name}"을(를) 지울까요?`,
      desc: "폴더 안의 항목도 함께 지워집니다.",
      onYes: async () => {
        setConfirm(null);
        try {
          await deleteFolder(f.id, true);
        } catch {
          /* ignore */
        }
        if (sel === f.id) pick(null);
        loadFolders();
      },
    });
  }

  async function open(id: string) {
    setOpening(id);
    try {
      const t = await getTemplate(id);
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
      setOpening(null);
    }
  }

  function askRemoveTemplate(id: string, name: string) {
    setConfirm({
      title: `"${name}"을(를) 지울까요?`,
      onYes: async () => {
        setConfirm(null);
        await deleteTemplate(id);
        loadTemplates(sel);
      },
    });
  }

  const tree = withDepth(folders);
  // 제목 검색(대소문자 무시). 목록이 100개 이하라 화면에서 바로 거른다.
  const shown = q.trim()
    ? items.filter((t) => (t.name || "").toLowerCase().includes(q.trim().toLowerCase()))
    : items;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white">
            <Icon icon="ph:folders-duotone" className="text-[20px]" />
          </span>
          보관함
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setNewOpen(true)} className="flex h-11 items-center gap-1 rounded-xl bg-emerald-600 px-4 text-base font-bold text-white hover:bg-emerald-500">
            <Icon icon="ph:plus-bold" /> 새 프로젝트
          </button>
          <button onClick={() => nav("/")} className="flex h-11 items-center gap-1 rounded-xl px-3 text-base text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <Icon icon="ph:house-duotone" /> 홈으로
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-5 py-8">
        <aside className="w-56 shrink-0">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-base font-semibold text-neutral-500">폴더</span>
            <button onClick={() => setNewFolderOpen(true)} className="flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30">
              <Icon icon="ph:folder-plus-bold" /> 새 폴더
            </button>
          </div>
          <button
            onClick={() => pick(null)}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-base ${sel === null ? "bg-emerald-100 font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
          >
            <Icon icon="ph:stack-duotone" /> 전체
          </button>
          {tree.map((f) => (
            <div key={f.id} className="group flex items-center" style={{ paddingLeft: f.depth * 14 }}>
              <button
                onClick={() => pick(f.id)}
                className={`flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left text-base ${sel === f.id ? "bg-emerald-100 font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
              >
                <Icon icon="ph:folder-duotone" className="shrink-0" />
                <span className="truncate">{f.name}</span>
              </button>
              <button onClick={() => askRemoveFolder(f)} className="ml-1 hidden h-8 w-8 place-items-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600 group-hover:grid dark:hover:bg-red-950/30" aria-label="폴더 지우기">
                <Icon icon="ph:trash" />
              </button>
            </div>
          ))}
        </aside>

        <main className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">저장한 홍보물</h1>
          <p className="mt-1 text-base text-neutral-500 dark:text-neutral-400">눌러서 다시 열고, 글자만 바꿔 재사용하세요.</p>

          {/* 제목으로 찾기 */}
          <div className="relative mt-4">
            <Icon icon="ph:magnifying-glass-bold" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[22px] text-neutral-400" />
            <input
              /* type=search 는 브라우저가 자체 X 버튼을 그려 우리 X와 겹친다 → text */
              type="text"
              inputMode="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="제목으로 찾기"
              placeholder="제목으로 찾기 (예: 행복식당)"
              className="h-14 w-full rounded-2xl border-2 border-neutral-200 bg-white pl-12 pr-12 text-lg outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 dark:border-neutral-800 dark:bg-neutral-900"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                aria-label="검색어 지우기"
                className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <Icon icon="ph:x-bold" />
              </button>
            )}
          </div>
          {q.trim() && !loading && (
            <p aria-live="polite" className="mt-2 text-base text-neutral-500 dark:text-neutral-400">
              <b className="text-emerald-700 dark:text-emerald-300">{shown.length}개</b> 찾았어요 (전체 {items.length}개 중)
            </p>
          )}

          {loading ? (
            <p className="mt-10 text-center text-neutral-400">불러오는 중...</p>
          ) : items.length === 0 ? (
            <div className="mt-6 rounded-3xl border-2 border-dashed border-neutral-300 p-12 text-center text-lg text-neutral-400 dark:border-neutral-700">
              이 폴더에는 저장한 홍보물이 없어요.
            </div>
          ) : shown.length === 0 ? (
            <div className="mt-6 rounded-3xl border-2 border-dashed border-neutral-300 p-12 text-center dark:border-neutral-700">
              <p className="text-lg text-neutral-500 dark:text-neutral-400">
                제목에 <b>“{q.trim()}”</b>이(가) 들어간 홍보물이 없어요.
              </p>
              <button
                onClick={() => setQ("")}
                className="mx-auto mt-4 flex h-12 items-center gap-1.5 rounded-xl border-2 border-neutral-200 px-4 text-base font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                <Icon icon="ph:arrow-counter-clockwise-bold" /> 검색어 지우고 전체 보기
              </button>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {shown.map((t) => (
                <div key={t.id} className="overflow-hidden rounded-2xl border-2 border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                  <button onClick={() => open(t.id)} disabled={opening === t.id} className="block w-full text-left">
                    <div className="relative aspect-square bg-neutral-100 dark:bg-neutral-800">
                      {t.thumb_url ? (
                        <img src={t.thumb_url} alt={t.name} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="grid h-full place-items-center text-neutral-300"><Icon icon="ph:image-duotone" className="text-4xl" /></div>
                      )}
                      {opening === t.id && (
                        <div className="absolute inset-0 grid place-items-center bg-white/60">
                          <Icon icon="ph:spinner-gap-bold" className="animate-spin text-3xl text-emerald-600" />
                        </div>
                      )}
                    </div>
                    <p className="truncate px-3 pt-2 text-base font-semibold">{t.name}</p>
                    <p className="px-3 pb-1 text-sm text-neutral-400">{t.size_w}×{t.size_h}</p>
                  </button>
                  <button onClick={() => askRemoveTemplate(t.id, t.name)} className="flex w-full items-center justify-center gap-1 border-t border-neutral-100 py-2 text-sm text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:border-neutral-800 dark:hover:bg-red-950/30">
                    <Icon icon="ph:trash-bold" /> 지우기
                  </button>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      <InputDialog
        open={newFolderOpen}
        icon="ph:folder-plus-duotone"
        title="새 폴더 만들기"
        desc="업체 이름 등으로 폴더를 만들어 정리하세요."
        placeholder="예) 행복식당"
        confirmLabel="만들기"
        onConfirm={addFolder}
        onClose={() => setNewFolderOpen(false)}
      />
      <ConfirmDialog
        open={!!confirm}
        icon="ph:warning-duotone"
        title={confirm?.title || ""}
        desc={confirm?.desc}
        onClose={() => setConfirm(null)}
        actions={[
          { label: "지우기", tone: "danger", icon: "ph:trash-bold", onClick: () => confirm?.onYes() },
          { label: "취소", tone: "ghost", onClick: () => setConfirm(null) },
        ]}
      />

      {/* 새 프로젝트 — AI 생성 / 이미지 올리기 선택 */}
      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...newDismiss}>
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-neutral-900 rise">
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-xl font-bold">새 프로젝트 만들기</h2>
              <button onClick={() => !uploading && setNewOpen(false)} disabled={uploading} className="grid h-9 w-9 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800">
                <Icon icon="ph:x-bold" />
              </button>
            </div>
            {uploading ? (
              <div className="grid place-items-center py-14 text-center">
                <Icon icon="ph:spinner-gap-bold" className="animate-spin text-5xl text-emerald-500" />
                <p className="mt-4 text-lg font-semibold">이미지를 올리는 중이에요...</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => { setNewOpen(false); nav("/studio"); }}
                  className="flex flex-col items-center gap-3 rounded-2xl border-2 border-neutral-200 p-6 text-center transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-neutral-700 dark:hover:bg-emerald-950/30"
                >
                  <span className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald-600 text-white">
                    <Icon icon="ph:magic-wand-duotone" className="text-[34px]" />
                  </span>
                  <span className="text-lg font-bold">AI로 만들기</span>
                  <span className="text-base text-neutral-500 dark:text-neutral-400">설명을 적으면 AI가 새로 그려줘요</span>
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center gap-3 rounded-2xl border-2 border-neutral-200 p-6 text-center transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-neutral-700 dark:hover:bg-emerald-950/30"
                >
                  <span className="grid h-16 w-16 place-items-center rounded-2xl bg-neutral-700 text-white">
                    <Icon icon="ph:upload-simple-duotone" className="text-[34px]" />
                  </span>
                  <span className="text-lg font-bold">이미지 올리기</span>
                  <span className="text-base text-neutral-500 dark:text-neutral-400">가진 그림(png·jpg)으로 시작해요</span>
                </button>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => doUpload(e.target.files?.[0])}
            />
          </div>
        </div>
      )}
    </div>
  );
}
