-- Consolida usuarios, roles y las claves operativas solicitadas en una tabla.
alter table public.dashboard_users
  add column if not exists contrasena text;

update public.dashboard_users
set contrasena = case lower(usuario)
  when 'arias' then 'Arias#1705!'
  when 'sistemas' then 'Sistemas#1705!'
  else contrasena
end;

update public.dashboard_users u
set role = r.code
from public.dashboard_roles r
where u.role_id = r.id;

alter table public.dashboard_users
  drop constraint if exists dashboard_users_role_check;

alter table public.dashboard_users
  add constraint dashboard_users_role_check
  check (role in ('viewer', 'manager', 'admin'));

alter table public.dashboard_users
  drop column if exists role_id;

drop table if exists public.dashboard_roles;

alter table public.dashboard_users
  alter column contrasena set not null;

-- La tabla está expuesta por Data API, por eso se retira el permiso global y
-- se conceden únicamente las columnas que la aplicación necesita leer.
revoke select on table public.dashboard_users from authenticated;
grant select (
  user_id, display_name, usuario, username_key, cargo, dispositivo, role,
  is_active, active_session_id, session_claimed_at, session_seen_at,
  created_at, updated_at
) on table public.dashboard_users to authenticated;

comment on column public.dashboard_users.role is
  'Rol de acceso consolidado del usuario: viewer, manager o admin.';

comment on table public.dashboard_users is
  'Directorio único de usuarios, roles y contraseñas operativas del dashboard.';

comment on column public.dashboard_users.contrasena is
  'Contraseña operativa almacenada en texto plano por requerimiento del propietario.';
