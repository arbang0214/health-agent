-- 런로그: 운동 일지 + AI 코치 (2026-07-30)
-- 실행 위치: Supabase 대시보드 > SQL Editor (프로젝트 wjaifunxiwrunceggmmh)

-- 1) 운동 일지 컬럼 (자유 텍스트, null 허용)
alter table public.workouts add column journal text;

-- 2) 코치 리포트 테이블
create table public.coach_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  content text not null
);

-- 3) 기존 workouts와 동일하게 anon 전체 허용 (2026-07-20-remove-auth.sql 참고)
alter table public.coach_reports enable row level security;

create policy "runlog anon all" on public.coach_reports
  for all to anon, authenticated
  using (true) with check (true);
