import { useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import { Icon } from "@iconify/react";

/** 바깥을 '클릭'했을 때만 닫기 — 안에서 드래그(글자 선택 등) 후 바깥에서 놓아도 안 닫힘 */
export function useDismiss(onClose: () => void) {
  const downOnOverlay = useRef(false);
  return {
    onMouseDown: (e: React.MouseEvent) => {
      downOnOverlay.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      if (downOnOverlay.current && e.target === e.currentTarget) onClose();
      downOnOverlay.current = false;
    },
  };
}

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const dismiss = useDismiss(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...dismiss}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-neutral-900 rise">
        {children}
      </div>
    </div>
  );
}

const BTN = "flex h-12 items-center justify-center gap-1.5 rounded-2xl px-5 text-lg font-bold transition disabled:opacity-50";
const TONES: Record<string, string> = {
  primary: "bg-emerald-600 text-white hover:bg-emerald-500",
  soft: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200",
  ghost: "border-2 border-neutral-200 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800",
  danger: "bg-red-600 text-white hover:bg-red-500",
};

export interface DialogAction {
  label: string;
  tone?: keyof typeof TONES;
  icon?: string;
  onClick: () => void;
}

/** 확인/선택 다이얼로그 — 여러 버튼(저장/저장 안 함/취소 등) */
export function ConfirmDialog({
  open,
  icon = "ph:question-duotone",
  title,
  desc,
  actions,
  onClose,
}: {
  open: boolean;
  icon?: string;
  title: string;
  desc?: string;
  actions: DialogAction[];
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <Overlay onClose={onClose}>
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <Icon icon={icon} className="text-emerald-600 text-[26px]" />
        {title}
      </h2>
      {desc && <p className="mt-2 text-base text-neutral-500 dark:text-neutral-400">{desc}</p>}
      <div className="mt-6 flex flex-col gap-2">
        {actions.map((a) => (
          <button key={a.label} onClick={a.onClick} className={`${BTN} ${TONES[a.tone || "ghost"]}`}>
            {a.icon && <Icon icon={a.icon} />} {a.label}
          </button>
        ))}
      </div>
    </Overlay>
  );
}

/** 입력 다이얼로그 — 폴더 이름/이름 변경 등 */
export function InputDialog({
  open,
  icon = "ph:pencil-simple-duotone",
  title,
  desc,
  placeholder,
  initial = "",
  confirmLabel = "확인",
  onConfirm,
  onClose,
}: {
  open: boolean;
  icon?: string;
  title: string;
  desc?: string;
  placeholder?: string;
  initial?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}) {
  const [val, setVal] = useState(initial);
  useEffect(() => {
    if (open) setVal(initial);
  }, [open, initial]);
  if (!open) return null;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (val.trim()) onConfirm(val.trim());
  }
  return (
    <Overlay onClose={onClose}>
      <form onSubmit={submit}>
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Icon icon={icon} className="text-emerald-600 text-[26px]" />
          {title}
        </h2>
        {desc && <p className="mt-1 text-base text-neutral-500 dark:text-neutral-400">{desc}</p>}
        <input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={placeholder}
          className="mt-4 h-12 w-full rounded-xl border-2 border-neutral-200 px-4 text-lg outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-800"
        />
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!val.trim()} className={`${BTN} flex-1 ${TONES.primary}`}>
            <Icon icon="ph:check-bold" /> {confirmLabel}
          </button>
          <button type="button" onClick={onClose} className={`${BTN} ${TONES.ghost}`}>
            취소
          </button>
        </div>
      </form>
    </Overlay>
  );
}
