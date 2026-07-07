import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { listTemplates, getTemplate, deleteTemplate, type TemplateListItem } from "../lib/library";

export default function Library() {
  const nav = useNavigate();
  const [items, setItems] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);

  async function load() {
    try {
      setItems(await listTemplates());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

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
        },
      });
    } finally {
      setOpening(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`"${name}"을(를) 보관함에서 지울까요?`)) return;
    await deleteTemplate(id);
    load();
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white">
            <Icon icon="ph:folders-duotone" className="text-[20px]" />
          </span>
          보관함
        </div>
        <button onClick={() => nav("/")} className="flex h-11 items-center gap-1 rounded-xl px-3 text-base text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          <Icon icon="ph:house-duotone" /> 홈으로
        </button>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="text-3xl font-bold">저장한 홍보물</h1>
        <p className="mt-1 text-lg text-neutral-500 dark:text-neutral-400">눌러서 다시 열고, 글자만 바꿔 재사용하세요.</p>

        {loading ? (
          <p className="mt-10 text-center text-neutral-400">불러오는 중...</p>
        ) : items.length === 0 ? (
          <div className="mt-6 rounded-3xl border-2 border-dashed border-neutral-300 p-12 text-center text-lg text-neutral-400 dark:border-neutral-700">
            아직 저장한 홍보물이 없어요. 편집기에서 "보관함에 저장"을 눌러 보세요.
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((t) => (
              <div key={t.id} className="group overflow-hidden rounded-2xl border-2 border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                <button onClick={() => open(t.id)} disabled={opening === t.id} className="block w-full text-left">
                  <div className="relative aspect-square bg-neutral-100 dark:bg-neutral-800">
                    {t.thumb_url ? (
                      <img src={t.thumb_url} alt={t.name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="grid h-full place-items-center text-neutral-300">
                        <Icon icon="ph:image-duotone" className="text-4xl" />
                      </div>
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
                <button
                  onClick={() => remove(t.id, t.name)}
                  className="flex w-full items-center justify-center gap-1 border-t border-neutral-100 py-2 text-sm text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:border-neutral-800 dark:hover:bg-red-950/30"
                >
                  <Icon icon="ph:trash-bold" /> 지우기
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
