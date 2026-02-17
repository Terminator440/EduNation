
-- COMMERCIAL EXTENSIONS

create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamp default now()
);

alter table students add column if not exists school_id uuid;
alter table subjects add column if not exists school_id uuid;
alter table grades add column if not exists school_id uuid;
alter table attendance add column if not exists school_id uuid;

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school_id uuid
);

alter table students add column if not exists class_id uuid;

-- RLS example
-- create policy "same school"
-- on grades for select
-- using (school_id = auth.uid());
