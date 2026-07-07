-- ai_create DB 스키마 (Supabase / PostgreSQL)
-- 계획서 §5 기반. 모든 DB 접근은 FastAPI 백엔드가 service_role(secret) 키로 수행하며,
-- RLS는 활성화하되 정책을 두지 않아 anon/authenticated의 직접 접근을 차단한다(service_role은 RLS 우회).
-- 적용: backend/.venv 파이썬으로 이 파일 실행(apply_schema.py) 또는 Supabase SQL Editor에 붙여넣기.

-- 확장
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- updated_at 자동 갱신 트리거 함수
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =========================================================
-- users : 사용자 프로필 (Supabase auth.users 확장)
--   monthly_limit_krw = NULL 이면 무제한(관리자 옵션)
-- =========================================================
create table if not exists public.users (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text unique not null,
  name              text,
  role              text not null default 'user' check (role in ('admin','user')),
  is_active         boolean not null default true,
  monthly_limit_krw integer default 15000,   -- NULL = 무제한
  created_at        timestamptz not null default now()
);

-- =========================================================
-- folders : 템플릿 트리(카테고리 > 업체명 > ...)
-- =========================================================
create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.folders(id) on delete cascade,
  name       text not null,
  sort_order integer not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_folders_parent on public.folders(parent_id);

-- =========================================================
-- templates : Fabric.js 캔버스 JSON + 프롬프트 + 배경 참조
-- =========================================================
create table if not exists public.templates (
  id            uuid primary key default gen_random_uuid(),
  folder_id     uuid references public.folders(id) on delete set null,
  name          text not null,
  canvas_json   jsonb,
  prompt        text,
  size_w        integer,
  size_h        integer,
  dpi           integer default 300,
  bg_image_path text,
  thumb_path    text,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_templates_folder on public.templates(folder_id);
drop trigger if exists trg_templates_updated on public.templates;
create trigger trg_templates_updated before update on public.templates
  for each row execute function public.set_updated_at();

-- =========================================================
-- generations : 생성 이력 + 비용
-- =========================================================
create table if not exists public.generations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  template_id    uuid references public.templates(id) on delete set null,
  prompt         text,
  model          text,
  quality        text check (quality in ('low','medium','high')),
  size           text,               -- "2480x3508" 형식
  ref_image_path text,
  result_path    text,
  cost_krw       numeric(10,2) not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists idx_generations_user_created on public.generations(user_id, created_at desc);

-- =========================================================
-- usage_monthly : 월 누적 사용액(한도 체크용 집계)
-- =========================================================
create table if not exists public.usage_monthly (
  user_id        uuid not null references public.users(id) on delete cascade,
  year_month     text not null,             -- 'YYYY-MM'
  total_cost_krw numeric(12,2) not null default 0,
  primary key (user_id, year_month)
);

-- =========================================================
-- presets : 딸깍 템플릿/배경/스타일 프리셋
-- =========================================================
create table if not exists public.presets (
  id         uuid primary key default gen_random_uuid(),
  type       text not null check (type in ('prompt','background','style')),
  name       text not null,
  payload    jsonb not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_presets_type on public.presets(type);

-- =========================================================
-- RLS : 전 테이블 활성화(정책 없음 → 직접 접근 차단, 백엔드 service_role만 우회)
-- =========================================================
alter table public.users         enable row level security;
alter table public.folders       enable row level security;
alter table public.templates     enable row level security;
alter table public.generations   enable row level security;
alter table public.usage_monthly enable row level security;
alter table public.presets       enable row level security;

-- =========================================================
-- Storage 버킷 : results(생성원본, 비공개) / thumbs(썸네일, 공개) / refs(참고이미지, 비공개)
-- =========================================================
insert into storage.buckets (id, name, public) values
  ('results', 'results', false),
  ('thumbs',  'thumbs',  true),
  ('refs',    'refs',    false)
on conflict (id) do nothing;
