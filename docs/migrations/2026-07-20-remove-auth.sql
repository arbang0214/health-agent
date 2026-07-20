-- 런로그 2차: 로그인 제거 마이그레이션
-- 실행 위치: Supabase 대시보드 > SQL Editor (프로젝트 wjaifunxiwrunceggmmh)
-- 효과: anon key만으로 workouts/photos 전체 접근 허용 (개인용 앱, 사용자 확인됨)

-- 1) user_id 기본값을 기존 계정 UUID로 고정 (인증 없는 insert 대비)
do $$
declare uid uuid;
begin
  select id into uid from auth.users order by created_at limit 1;
  if uid is null then
    raise exception 'auth.users가 비어 있습니다 — 기존 계정을 찾을 수 없음';
  end if;
  execute format('alter table public.workouts alter column user_id set default %L', uid);
end $$;

-- 2) workouts: 기존 정책 전부 제거 후 anon 전체 허용
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'workouts'
  loop
    execute format('drop policy %I on public.workouts', p.policyname);
  end loop;
end $$;

create policy "runlog anon all" on public.workouts
  for all to anon, authenticated
  using (true) with check (true);

-- 3) storage.objects: 기존 정책 전부 제거 후 photos 버킷 anon 허용
--    (이 프로젝트의 버킷은 photos 하나뿐)
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

create policy "runlog photos anon all" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'photos') with check (bucket_id = 'photos');
