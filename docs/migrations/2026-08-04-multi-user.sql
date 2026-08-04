-- 멀티유저 전환: 매직링크 로그인 + 사용자별 데이터 분리 (2026-08-04)
-- 실행 위치: Supabase 대시보드 > SQL Editor (프로젝트 wjaifunxiwrunceggmmh)
-- 전제: auth.users에 소유자 계정이 존재 (가장 오래된 계정 — 2026-07-20-remove-auth.sql과 동일 기준)
-- 효과: 기존 데이터(기록·목표·리포트·사진)는 전부 소유자 계정 귀속,
--       이후 모든 접근은 로그인 사용자 본인 데이터로 제한(RLS)

do $$
declare owner uuid;
begin
  select id into owner from auth.users order by created_at limit 1;
  if owner is null then
    raise exception 'auth.users가 비어 있습니다 — 소유자 계정을 찾을 수 없음';
  end if;

  -- 1) goals: user_id 추가 → 기존 행 소유자 귀속 → 필수화 + 기본값 auth.uid()
  alter table public.goals add column if not exists user_id uuid references auth.users(id);
  update public.goals set user_id = owner where user_id is null;
  alter table public.goals alter column user_id set not null;
  alter table public.goals alter column user_id set default auth.uid();

  -- 2) coach_reports: 동일
  alter table public.coach_reports add column if not exists user_id uuid references auth.users(id);
  update public.coach_reports set user_id = owner where user_id is null;
  alter table public.coach_reports alter column user_id set not null;
  alter table public.coach_reports alter column user_id set default auth.uid();

  -- 3) workouts: 7/20에 고정해둔 default를 auth.uid()로 복원
  --    (기존 행은 이미 전부 소유자 user_id라 백필 불필요)
  alter table public.workouts alter column user_id set default auth.uid();

  -- 4) 사진: 새 업로드는 {user_id}/ 폴더에만 허용, 기존 public/ 폴더는 소유자만 접근
  drop policy if exists "runlog photos anon all" on storage.objects;
  execute format($f$
    create policy "runlog photos per user" on storage.objects
      for all to authenticated
      using (bucket_id = 'photos' and (
        (storage.foldername(name))[1] = auth.uid()::text
        or ((storage.foldername(name))[1] = 'public' and auth.uid() = %L)
      ))
      with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  $f$, owner);
end $$;

-- 5) 테이블 RLS: anon 개방 정책 제거 → 로그인 사용자 본인 데이터만
drop policy if exists "runlog anon all" on public.workouts;
create policy "runlog per user" on public.workouts
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "runlog anon all" on public.goals;
create policy "runlog per user" on public.goals
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "runlog anon all" on public.coach_reports;
create policy "runlog per user" on public.coach_reports
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
