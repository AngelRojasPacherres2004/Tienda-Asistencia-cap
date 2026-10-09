-- Esquema previo a la sincronización de las cuentas comerciales.
-- No contiene contraseñas ni cambia usuarios existentes.
begin;

insert into public.roles (codigo, nombre, nivel, ambito_tienda, orden)
values ('sistemas', 'Sistemas', 10, false, 35)
on conflict (codigo) do update set nombre = excluded.nombre, nivel = excluded.nivel, activo = true;

-- Los dos accesos comerciales adicionales son cuentas de portal, no fichas de
-- empleados: no se inventa un DNI para satisfacer un campo obligatorio.
alter table public.usuarios alter column dni drop not null;
alter table public.usuarios add column if not exists portal_only boolean not null default false;
alter table public.usuarios drop constraint if exists usuarios_tienda_rol_check;
alter table public.usuarios add constraint usuarios_tienda_rol_check check (
  (rol in ('gerencia_general', 'gerente_comercial', 'sistemas', 'marketing', 'coach', 'jefe_zonal') and tienda_id is null)
  or (rol = 'jefe_tienda' and tienda_id is not null)
  or (rol in ('asistente_tienda', 'jefe_seguridad', 'jefe_area', 'seguridad', 'caja', 'almacenero', 'vendedor', 'asistente', 'trabajador') and tienda_id is not null)
);

create table if not exists public.commercial_store_map (
  dashboard_store_id text primary key check (dashboard_store_id ~ '^T[0-9]{3}$'),
  tienda_id integer not null unique references public.tiendas(id) on delete restrict,
  cluster_code text not null check (cluster_code in ('A', 'B'))
);

create table if not exists public.commercial_user_scopes (
  usuario_id integer primary key references public.usuarios(id) on delete cascade,
  scope_type text not null check (scope_type in ('all', 'cluster', 'store')),
  scope_value text,
  updated_at timestamptz not null default now(),
  check (
    (scope_type = 'all' and scope_value is null)
    or (scope_type = 'cluster' and scope_value in ('A', 'B'))
    or (scope_type = 'store' and scope_value ~ '^T[0-9]{3}$')
  )
);

-- Archivos comerciales de alcance limitado. Los usuarios de Asiste acceden
-- exclusivamente a través de la API, que verifica su asignación vigente.
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

-- Falla si falta una tienda o si una correspondencia no es única. No crea
-- tiendas nuevas ni mezcla nombres parecidos por aproximación.
do $$
declare
  matched_count integer;
begin
  with expected(code, store_name, cluster) as (
    values
      ('T001','LA MARINA','A'), ('T002','ARAMBURÚ','B'),
      ('T003','EMANCIPACIÓN','A'), ('T004','INDEPENDENCIA','A'),
      ('T005','ALFONSO UGARTE','B'), ('T006','ANGAMOS','B'),
      ('T007','PERSHING','A'), ('T008','ALIPIO','B'),
      ('T009','CHORRILLOS','B'), ('T010','TRUJILLO','A'),
      ('T011','PUENTE PIEDRA','A'), ('T012','AYACUCHO','A'),
      ('T013','CALLAO','B'), ('T014','TUMBES','A'),
      ('T015','PLAZA UNIÓN','B'), ('T016','JR. DE LA UNIÓN 797','B'),
      ('T017','ARGENTINA','B'), ('T018','PUNO','B')
  )
  select count(*) into matched_count
  from expected e join public.tiendas t on t.nombre = e.store_name;
  if matched_count <> 18 then
    raise exception 'Correspondencia comercial incompleta: % de 18 tiendas', matched_count;
  end if;
end $$;

insert into public.commercial_store_map (dashboard_store_id, tienda_id, cluster_code)
select e.code, t.id, e.cluster
from (values
  ('T001','LA MARINA','A'), ('T002','ARAMBURÚ','B'),
  ('T003','EMANCIPACIÓN','A'), ('T004','INDEPENDENCIA','A'),
  ('T005','ALFONSO UGARTE','B'), ('T006','ANGAMOS','B'),
  ('T007','PERSHING','A'), ('T008','ALIPIO','B'),
  ('T009','CHORRILLOS','B'), ('T010','TRUJILLO','A'),
  ('T011','PUENTE PIEDRA','A'), ('T012','AYACUCHO','A'),
  ('T013','CALLAO','B'), ('T014','TUMBES','A'),
  ('T015','PLAZA UNIÓN','B'), ('T016','JR. DE LA UNIÓN 797','B'),
  ('T017','ARGENTINA','B'), ('T018','PUNO','B')
) as e(code, store_name, cluster)
join public.tiendas t on t.nombre = e.store_name
on conflict (dashboard_store_id) do update set
  tienda_id = excluded.tienda_id, cluster_code = excluded.cluster_code;

alter table public.commercial_store_map enable row level security;
alter table public.commercial_user_scopes enable row level security;
alter table public.dashboard_scope_files enable row level security;
revoke all on table public.commercial_store_map from anon, authenticated;
revoke all on table public.commercial_user_scopes from anon, authenticated;
revoke all on table public.dashboard_scope_files from anon, authenticated;
grant select on table public.commercial_store_map to service_role;
grant select, insert, update, delete on table public.commercial_user_scopes to service_role;
grant select, insert, update, delete on table public.dashboard_scope_files to service_role;
grant usage, select on sequence public.dashboard_scope_files_id_seq to service_role;

commit;
