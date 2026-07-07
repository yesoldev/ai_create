// [임시 배선용] 각 화면은 이후 단계에서 /frontend-design-merged 스킬로 구현
import { Icon } from "@iconify/react";
import { useAuth } from "../lib/auth";

function Placeholder({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <Icon icon={icon} className="text-indigo-600" />
            {title}
          </div>
          <button onClick={logout} className="text-slate-500 hover:text-slate-800">
            로그아웃 ({user?.email})
          </button>
        </div>
        <p className="text-lg text-slate-500">{desc}</p>
        <div className="rounded-xl border-2 border-dashed border-slate-300 p-12 text-center text-slate-400">
          이 화면은 다음 단계에서 구현됩니다.
        </div>
      </div>
    </div>
  );
}

export const Home = () => (
  <Placeholder icon="ph:house-bold" title="홈" desc="최근 작업 · 잔여 한도 · 빠른 생성" />
);
export const Studio = () => (
  <Placeholder icon="ph:magic-wand-bold" title="만들기" desc="종류 선택 → 템플릿 → 문구 → 만들기" />
);
export const Editor = () => (
  <Placeholder icon="ph:pencil-simple-bold" title="편집기" desc="글자·도형·색 편집, 부분 재생성" />
);
export const Library = () => (
  <Placeholder icon="ph:folders-bold" title="보관함" desc="템플릿 트리 · 썸네일" />
);
export const Admin = () => (
  <Placeholder icon="ph:gear-bold" title="관리자" desc="계정 · 한도 · 사용량 통계" />
);
