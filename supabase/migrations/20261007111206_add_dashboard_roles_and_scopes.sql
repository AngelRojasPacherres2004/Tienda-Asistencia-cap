-- Modelo escalable de acceso al dashboard.
-- El rol define si el usuario entra y el tipo de alcance; los valores concretos
-- (tienda o clúster) se asignan en dashboard_user_scopes.
create table if not exists public.dashboard_roles (
  code text primary key,
  name text not null,
  can_access_dashboard boolean not null default true,
  scope_type text not null check (scope_type in ('all', 'store', 'cluster', 'none')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.dashboard_roles (code, name, can_access_dashboard, scope_type)
values
  ('jefe_comercial', 'Jefe comercial', true, 'all'),
  ('administrador_tienda', 'Administrador de tienda', true, 'store'),
  ('zonal', 'Responsable zonal', true, 'cluster'),
  ('seguridad', 'Seguridad', false, 'none')
on conflict (code) do update set
  name = excluded.name,
  can_access_dashboard = excluded.can_access_dashboard,
  scope_type = excluded.scope_type,
  is_active = true,
  updated_at = now();

alter table public.dashboard_users
  drop constraint if exists dashboard_users_role_check,
  drop constraint if exists dashboard_users_role_fkey;

-- Los dos usuarios existentes conservan el acceso general. Las asignaciones
-- restringidas se harán explícitamente al crear o editar cada usuario.
update public.dashboard_users
set role = 'jefe_comercial', updated_at = now()
where role in ('admin', 'manager', 'viewer');

alter table public.dashboard_users
  alter column role set default 'jefe_comercial',
  add constraint dashboard_users_role_fkey
    foreign key (role) references public.dashboard_roles(code);

create table if not exists public.dashboard_user_scopes (
  user_id uuid not null references public.dashboard_users(user_id) on delete cascade,
  scope_type text not null check (scope_type in ('store', 'cluster')),
  scope_value text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, scope_type, scope_value),
  check (length(trim(scope_value)) > 0)
);

create index if not exists dashboard_user_scopes_user_idx
  on public.dashboard_user_scopes (user_id);

alter table public.dashboard_roles enable row level security;
alter table public.dashboard_user_scopes enable row level security;

drop policy if exists "authenticated users can read dashboard roles" on public.dashboard_roles;
create policy "authenticated users can read dashboard roles"
on public.dashboard_roles for select to authenticated
using (is_active = true);

drop policy if exists "users can read own dashboard scopes" on public.dashboard_user_scopes;
create policy "users can read own dashboard scopes"
on public.dashboard_user_scopes for select to authenticated
using (user_id = (select auth.uid()));

-- Un usuario inactivo, un rol deshabilitado o Seguridad no puede leer ningún
-- manifiesto ni archivo, aunque conserve una sesión anterior.
drop policy if exists "active session can read dashboard releases" on public.dashboard_releases;
create policy "active session can read dashboard releases"
on public.dashboard_releases for select to authenticated
using (
  exists (
    select 1
    from public.dashboard_users u
    join public.dashboard_roles r on r.code = u.role
    where u.user_id = (select auth.uid())
      and u.is_active = true
      and r.is_active = true
      and r.can_access_dashboard = true
      and (
        r.scope_type = 'all'
        or exists (
          select 1 from public.dashboard_user_scopes s
          where s.user_id = u.user_id and s.scope_type = r.scope_type
        )
      )
      and u.active_session_id::text = ((select auth.jwt()) ->> 'session_id')
  )
);

drop policy if exists "active session can read dashboard files" on public.dashboard_files;
create policy "active session can read dashboard files"
on public.dashboard_files for select to authenticated
using (
  exists (
    select 1
    from public.dashboard_users u
    join public.dashboard_roles r on r.code = u.role
    where u.user_id = (select auth.uid())
      and u.is_active = true
      and r.is_active = true
      and r.can_access_dashboard = true
      and (
        r.scope_type = 'all'
        or exists (
          select 1 from public.dashboard_user_scopes s
          where s.user_id = u.user_id and s.scope_type = r.scope_type
        )
      )
      and u.active_session_id::text = ((select auth.jwt()) ->> 'session_id')
  )
);

drop policy if exists "active session can read private dashboard objects" on storage.objects;
create policy "active session can read private dashboard objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'dashboard-data'
  and exists (
    select 1
    from public.dashboard_users u
    join public.dashboard_roles r on r.code = u.role
    where u.user_id = (select auth.uid())
      and u.is_active = true
      and r.is_active = true
      and r.can_access_dashboard = true
      and (
        r.scope_type = 'all'
        or exists (
          select 1 from public.dashboard_user_scopes s
          where s.user_id = u.user_id and s.scope_type = r.scope_type
        )
      )
      and u.active_session_id::text = ((select auth.jwt()) ->> 'session_id')
  )
);

drop policy if exists "admins can delete dashboard releases" on public.dashboard_releases;
drop policy if exists "commercial chiefs can delete dashboard releases" on public.dashboard_releases;
create policy "commercial chiefs can delete dashboard releases"
on public.dashboard_releases for delete to authenticated
using (
  exists (
    select 1 from public.dashboard_users u
    where u.user_id = (select auth.uid())
      and u.is_active = true
      and u.role = 'jefe_comercial'
  )
);

drop policy if exists "admins can delete private dashboard objects" on storage.objects;
drop policy if exists "commercial chiefs can delete private dashboard objects" on storage.objects;
create policy "commercial chiefs can delete private dashboard objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'dashboard-data'
  and exists (
    select 1 from public.dashboard_users u
    where u.user_id = (select auth.uid())
      and u.is_active = true
      and u.role = 'jefe_comercial'
  )
);

revoke all on table public.dashboard_roles from anon, authenticated;
revoke all on table public.dashboard_user_scopes from anon, authenticated;
grant select (code, name, can_access_dashboard, scope_type, is_active)
  on table public.dashboard_roles to authenticated;
grant select (user_id, scope_type, scope_value, created_at)
  on table public.dashboard_user_scopes to authenticated;

comment on table public.dashboard_roles is
  'Catálogo de roles del dashboard y tipo de alcance que aplica a cada uno.';
comment on table public.dashboard_user_scopes is
  'Tiendas o clústeres permitidos por usuario. Ejemplos: T012, A o B.';
comment on column public.dashboard_users.role is
  'Código de rol: jefe_comercial, administrador_tienda, zonal o seguridad.';
