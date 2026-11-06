-- Homologa las cuentas técnicas del dashboard con los roles operativos actuales.
-- No elimina usuarios de public.usuarios ni cuentas de seguridad: ambas fuentes
-- representan cosas distintas y se muestran juntas en /personas/directorio.

create table if not exists public.dashboard_roles (
  code text primary key,
  name text not null,
  can_access_dashboard boolean not null default true,
  scope_type text not null check (scope_type in ('all', 'store', 'cluster', 'none')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.dashboard_roles (code, name, can_access_dashboard, scope_type, is_active)
values
  ('gerente_comercial', 'Gerente comercial', true, 'all', true),
  ('jefe_tienda', 'Administrador de tienda', true, 'store', true),
  ('jefe_zonal', 'Jefe zonal', true, 'cluster', true),
  ('seguridad', 'Seguridad', false, 'none', false),
  -- Alias históricos: se conservan para que una cuenta antigua no pierda
  -- integridad referencial mientras se migra su fila a un código canónico.
  ('jefe_comercial', 'Alias histórico: gerente comercial', false, 'all', false),
  ('administrador_tienda', 'Alias histórico: administrador de tienda', false, 'store', false),
  ('zonal', 'Alias histórico: jefe zonal', false, 'cluster', false)
on conflict (code) do update set
  name = excluded.name,
  can_access_dashboard = excluded.can_access_dashboard,
  scope_type = excluded.scope_type,
  is_active = excluded.is_active,
  updated_at = now();

create table if not exists public.dashboard_user_scopes (
  user_id uuid not null references public.dashboard_users(user_id) on delete cascade,
  scope_type text not null check (scope_type in ('store', 'cluster')),
  scope_value text not null check (length(trim(scope_value)) > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, scope_type, scope_value)
);

create index if not exists dashboard_user_scopes_user_idx
  on public.dashboard_user_scopes(user_id);

alter table public.dashboard_user_scopes enable row level security;

alter table public.dashboard_users
  drop constraint if exists dashboard_users_role_check,
  drop constraint if exists dashboard_users_role_fkey;

update public.dashboard_users
set role = case lower(trim(role))
  when 'admin' then 'gerente_comercial'
  when 'manager' then 'gerente_comercial'
  when 'viewer' then 'gerente_comercial'
  when 'jefe_comercial' then 'gerente_comercial'
  when 'administrador_tienda' then 'jefe_tienda'
  when 'zonal' then 'jefe_zonal'
  else role
end,
updated_at = now();

alter table public.dashboard_users
  alter column role set default 'gerente_comercial',
  add constraint dashboard_users_role_fkey
    foreign key (role) references public.dashboard_roles(code);

comment on table public.dashboard_roles is
  'Catálogo canónico para cuentas técnicas: gerente_comercial, jefe_zonal, jefe_tienda. Los alias históricos quedan inactivos.';
comment on column public.dashboard_users.role is
  'Código canónico de acceso al dashboard. Las fichas operativas y sus roles viven en public.usuarios.';

-- Limpia alias que todavía pudieran existir en la ficha operativa. No toca
-- personas ni estados: solo reemplaza el código de rol por su equivalente.
update public.usuarios
set rol = case lower(trim(rol))
  when 'gerente' then 'gerente_comercial'
  when 'jefe_comercial' then 'gerente_comercial'
  when 'administrador_tienda' then 'jefe_tienda'
  when 'zonal' then 'jefe_zonal'
  else rol
end
where lower(trim(rol)) in ('gerente', 'jefe_comercial', 'administrador_tienda', 'zonal');
