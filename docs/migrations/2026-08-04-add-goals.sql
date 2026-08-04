-- 러닝 목표 설정 + 목표 인지 코칭 (2026-08-04)
-- 실행 위치: Supabase 대시보드 > SQL Editor (프로젝트 wjaifunxiwrunceggmmh)

-- 목표 테이블: 수정 대신 삽입만 한다 — 최신 행이 현재 목표, 과거 행은 변경 이력.
-- source: 'manual'(목표 영역에서 직접 설정) | 'journal'(운동 일지에서 변경 감지)
create table public.goals (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  content    text not null,
  source     text not null default 'manual' check (source in ('manual', 'journal'))
);

-- 기존 workouts/coach_reports와 동일하게 anon 전체 허용 (2026-07-20-remove-auth.sql 참고)
alter table public.goals enable row level security;

create policy "runlog anon all" on public.goals
  for all to anon, authenticated
  using (true) with check (true);
