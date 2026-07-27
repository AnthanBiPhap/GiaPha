-- Ảnh bia mộ / tư liệu theo thành viên
create table if not exists member_photos (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade not null,
  member_id uuid references members(id) on delete cascade not null,
  url text not null,
  storage_path text,
  caption text,
  created_at timestamptz default now()
);

alter table member_photos enable row level security;

drop policy if exists "Access member_photos of owned families" on member_photos;
create policy "Access member_photos of owned families"
  on member_photos for all
  using (family_id in (select id from families where owner_id = auth.uid()))
  with check (family_id in (select id from families where owner_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('graves', 'graves', true)
on conflict (id) do nothing;

drop policy if exists "Graves public read" on storage.objects;
create policy "Graves public read"
  on storage.objects for select
  using (bucket_id = 'graves');

drop policy if exists "Graves auth upload" on storage.objects;
create policy "Graves auth upload"
  on storage.objects for insert
  with check (bucket_id = 'graves' and auth.role() = 'authenticated');

drop policy if exists "Graves auth update" on storage.objects;
create policy "Graves auth update"
  on storage.objects for update
  using (bucket_id = 'graves' and auth.role() = 'authenticated');

drop policy if exists "Graves auth delete" on storage.objects;
create policy "Graves auth delete"
  on storage.objects for delete
  using (bucket_id = 'graves' and auth.role() = 'authenticated');
