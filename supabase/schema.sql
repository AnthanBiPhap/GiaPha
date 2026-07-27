-- Schema khởi tạo cho Gia Phả Online

create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  full_name text not null,
  gender text check (gender in ('male','female','other')),
  birth_date date,
  death_date date,
  is_alive boolean default true,
  generation int,
  avatar_url text,
  bio text,
  birth_place text,
  birth_lat double precision,
  birth_lng double precision,
  death_place text,
  death_lat double precision,
  death_lng double precision,
  current_place text,
  current_lat double precision,
  current_lng double precision,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists relationships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  person_a uuid references members(id) on delete cascade,
  person_b uuid references members(id) on delete cascade,
  relation_type text check (relation_type in ('parent_child','spouse','sibling')),
  created_at timestamptz default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  event_type text,
  event_date date,
  location text,
  lat double precision,
  lng double precision,
  description text,
  created_at timestamptz default now()
);

create table if not exists member_photos (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade not null,
  member_id uuid references members(id) on delete cascade not null,
  url text not null,
  storage_path text,
  caption text,
  created_at timestamptz default now()
);

alter table families enable row level security;
alter table members enable row level security;
alter table relationships enable row level security;
alter table events enable row level security;
alter table member_photos enable row level security;

drop policy if exists "Owner full access on families" on families;
create policy "Owner full access on families"
  on families for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Access members of owned families" on members;
create policy "Access members of owned families"
  on members for all
  using (family_id in (select id from families where owner_id = auth.uid()))
  with check (family_id in (select id from families where owner_id = auth.uid()));

drop policy if exists "Access relationships of owned families" on relationships;
create policy "Access relationships of owned families"
  on relationships for all
  using (family_id in (select id from families where owner_id = auth.uid()))
  with check (family_id in (select id from families where owner_id = auth.uid()));

drop policy if exists "Access events of owned families" on events;
create policy "Access events of owned families"
  on events for all
  using (family_id in (select id from families where owner_id = auth.uid()))
  with check (family_id in (select id from families where owner_id = auth.uid()));

drop policy if exists "Access member_photos of owned families" on member_photos;
create policy "Access member_photos of owned families"
  on member_photos for all
  using (family_id in (select id from families where owner_id = auth.uid()))
  with check (family_id in (select id from families where owner_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('graves', 'graves', true)
on conflict (id) do nothing;

drop policy if exists "Avatar public read" on storage.objects;
create policy "Avatar public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Avatar auth upload" on storage.objects;
create policy "Avatar auth upload"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.role() = 'authenticated');

drop policy if exists "Avatar auth update" on storage.objects;
create policy "Avatar auth update"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.role() = 'authenticated');

drop policy if exists "Avatar auth delete" on storage.objects;
create policy "Avatar auth delete"
  on storage.objects for delete
  using (bucket_id = 'avatars' and auth.role() = 'authenticated');

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
