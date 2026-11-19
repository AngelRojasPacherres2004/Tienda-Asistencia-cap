alter table public.usuarios add column if not exists secciones_permitidas text[] default null;
alter table public.usuarios add constraint usuarios_secciones_permitidas_validas check (
 secciones_permitidas is null or (cardinality(secciones_permitidas) between 1 and 64 and array_position(secciones_permitidas, null) is null)
);
comment on column public.usuarios.secciones_permitidas is 'Secciones habilitadas por Sistemas; NULL conserva el menú del rol.';
update public.usuarios set secciones_permitidas = array['dashboard']::text[] where acceso_solo_resumen_comercial and secciones_permitidas is null;
