-- Etapa 1. Aplicar antes de publicar archivos limitados por tienda/clúster.
-- No altera aún los accesos existentes; permite una transición sin corte.
begin;
create table if not exists public.dashboard_scope_files (
  id bigint generated always as identity primary key,
  release_id uuid not null references public.dashboard_releases(id) on delete cascade,
  scope_type text not null check (scope_type in ('store', 'cluster')),
  scope_value text not null,
  logical_name text not null,
  byte_size bigint not null check (byte_size >= 0),
  checksum_sha256 text not null,
  content_type text not null default 'application/gzip',
  parts jsonb not null check (jsonb_typeof(parts) = 'array'),
  created_at timestamptz not null default now(),
  unique (release_id, scope_type, scope_value, logical_name)
);
create index if not exists dashboard_scope_files_release_idx
  on public.dashboard_scope_files (release_id, scope_type, scope_value);
alter table public.dashboard_scope_files enable row level security;
revoke all on public.dashboard_scope_files from anon, authenticated;
grant select, insert on public.dashboard_scope_files to authenticated;
grant usage, select on sequence public.dashboard_scope_files_id_seq to authenticated;

drop policy if exists "publisher can insert scoped dashboard files" on public.dashboard_scope_files;
create policy "publisher can insert scoped dashboard files"
on public.dashboard_scope_files for insert to authenticated
with check (
  exists (
    select 1 from public.dashboard_users u
    where u.user_id = (select auth.uid())
      and u.is_active and u.role = 'jefe_comercial'
      and (select auth.jwt()) -> 'app_metadata' ->> 'purpose' = 'dashboard_publisher'
  )
);

drop policy if exists "users can read scoped dashboard files" on public.dashboard_scope_files;
create policy "users can read scoped dashboard files"
on public.dashboard_scope_files for select to authenticated
using (
  exists (
    select 1
    from public.dashboard_users u
    join public.dashboard_roles r on r.code = u.role
    join public.dashboard_user_scopes s on s.user_id = u.user_id
    where u.user_id = (select auth.uid())
      and u.is_active and r.is_active and r.can_access_dashboard
      and r.scope_type = dashboard_scope_files.scope_type
      and s.scope_type = dashboard_scope_files.scope_type
      and s.scope_value = dashboard_scope_files.scope_value
      and u.active_session_id::text = ((select auth.jwt()) ->> 'session_id')
  )
);
commit;
