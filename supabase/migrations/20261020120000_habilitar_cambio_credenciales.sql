-- Sistemas autoriza un cambio de credenciales por cuenta. El permiso se consume
-- al guardar el nuevo usuario y la nueva contraseña desde una sesión válida.
alter table public.usuarios
  add column if not exists cambio_credenciales_pendiente boolean not null default false;

alter table public.usuarios
  add column if not exists credenciales_actualizadas_en timestamptz;
