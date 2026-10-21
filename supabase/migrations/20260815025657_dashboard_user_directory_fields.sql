alter table public.dashboard_users
  add column if not exists usuario text,
  add column if not exists cargo text not null default 'GENERAL',
  add column if not exists dispositivo text not null default 'xxxxxxx';

update public.dashboard_users
set
  usuario = coalesce(usuario, display_name, split_part((select email from auth.users where id = user_id), '@', 1)),
  cargo = case when cargo = '' then 'GENERAL' else cargo end,
  dispositivo = case when dispositivo = '' then 'xxxxxxx' else dispositivo end
where usuario is null or cargo = '' or dispositivo = '';

alter table public.dashboard_users
  alter column usuario set not null;

create unique index if not exists dashboard_users_usuario_unique
  on public.dashboard_users (lower(usuario));

comment on column public.dashboard_users.usuario is
  'Nombre de inicio de sesión mostrado al operador; la identidad real permanece en Supabase Auth.';
comment on column public.dashboard_users.cargo is
  'Cargo descriptivo del usuario dentro de la organización.';
comment on column public.dashboard_users.dispositivo is
  'Etiqueta administrativa del dispositivo; el control efectivo usa active_session_id.';

update public.dashboard_users
set cargo = 'GENERAL', dispositivo = 'xxxxxxx'
where usuario in ('Sistemas', 'Arias');
