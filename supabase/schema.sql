-- 운동 기록 테이블 (2차 OCR 확장 대비 수치 컬럼 포함, 1차에서는 항상 null)
create table public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) default auth.uid(),
  taken_at     timestamptz not null,
  duration_min numeric,
  distance_km  numeric,
  calories     integer,
  analyzed_at  timestamptz,
  photo_path   text not null,
  created_at   timestamptz not null default now()
);

alter table public.workouts enable row level security;

create policy "own_select" on public.workouts for select using (auth.uid() = user_id);
create policy "own_insert" on public.workouts for insert with check (auth.uid() = user_id);
create policy "own_update" on public.workouts for update using (auth.uid() = user_id);
create policy "own_delete" on public.workouts for delete using (auth.uid() = user_id);

-- 비공개 사진 버킷: 경로 첫 폴더 = 본인 user_id 일 때만 접근
insert into storage.buckets (id, name, public) values ('photos', 'photos', false);

create policy "own_photos_select" on storage.objects for select
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own_photos_insert" on storage.objects for insert
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own_photos_delete" on storage.objects for delete
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
