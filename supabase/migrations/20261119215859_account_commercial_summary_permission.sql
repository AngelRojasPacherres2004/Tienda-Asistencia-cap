-- El permiso se valida desde el servidor; no altera el rol ni el alcance de tiendas.
alter table public.usuarios
  add column if not exists acceso_solo_resumen_comercial boolean not null default false;
comment on column public.usuarios.acceso_solo_resumen_comercial is
  'Administrado por Sistemas: restringe la cuenta a consultas de Resumen comercial.';
