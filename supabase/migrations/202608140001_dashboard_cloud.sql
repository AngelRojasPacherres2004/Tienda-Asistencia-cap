create extension if not exists pgcrypto;

create table if not exists public.dashboard_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'viewer' check (role in ('viewer', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dashboard_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  status text not null default 'staging' check (status in ('staging', 'published', 'failed')),
  sales_cutoff date not null,
  stock_cutoff date not null,
  generated_at timestamptz not null,
  published_at timestamptz,
  total_bytes bigint not null default 0 check (total_bytes >= 0),
  checksum_sha256 text not null,
  manifest jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.dashboard_files (
  id bigint generated always as identity primary key,
  release_id uuid not null references public.dashboard_releases(id) on delete cascade,
  logical_name text not null,
  byte_size bigint not null check (byte_size >= 0),
  checksum_sha256 text not null,
  content_type text not null default 'application/json',
  parts jsonb not null check (jsonb_typeof(parts) = 'array'),
  created_at timestamptz not null default now(),
  unique (release_id, logical_name)
);

create index if not exists dashboard_releases_published_idx
  on public.dashboard_releases (published_at desc)
  where status = 'published';
create index if not exists dashboard_files_release_idx
  on public.dashboard_files (release_id);

alter table public.dashboard_users enable row level security;
alter table public.dashboard_releases enable row level security;
alter table public.dashboard_files enable row level security;

create policy "users can read own dashboard profile"
on public.dashboard_users for select
to authenticated
using (user_id = (select auth.uid()));

create policy "active users can read dashboard releases"
on public.dashboard_releases for select
to authenticated
using (
  exists (
    select 1 from public.dashboard_users
    where user_id = (select auth.uid()) and is_active = true
  )
);

create policy "active users can read dashboard files"
on public.dashboard_files for select
to authenticated
using (
  exists (
    select 1 from public.dashboard_users
    where user_id = (select auth.uid()) and is_active = true
  )
);

revoke all on table public.dashboard_users from anon;
revoke all on table public.dashboard_releases from anon;
revoke all on table public.dashboard_files from anon;
grant select on table public.dashboard_users to authenticated;
grant select on table public.dashboard_releases to authenticated;
grant select on table public.dashboard_files to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dashboard-data',
  'dashboard-data',
  false,
  6291456,
  array['application/octet-stream', 'application/json']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "active users can read private dashboard objects"
on storage.objects for select
to authenticated
using (
  bucket_id = 'dashboard-data'
  and exists (
    select 1 from public.dashboard_users
    where user_id = (select auth.uid()) and is_active = true
  )
);

comment on table public.dashboard_releases is 'Versiones atómicas publicadas por 2_ACTUALIZAR_DATOS.bat.';
comment on table public.dashboard_files is 'Manifiesto y partes privadas de cada JSON del dashboard.';
comment on table public.dashboard_users is 'Lista autorizada de usuarios del dashboard; las contraseñas permanecen en Supabase Auth.';
