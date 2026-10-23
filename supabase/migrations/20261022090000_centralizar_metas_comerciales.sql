alter table public.metas_comerciales_tienda
  add column if not exists rubro text not null default '';

alter table public.metas_comerciales_tienda
  drop constraint if exists metas_comerciales_tienda_tienda_id_anio_mes_key;

create unique index if not exists metas_comerciales_tienda_alcance_ux
  on public.metas_comerciales_tienda (tienda_id, anio, mes, rubro);

create index if not exists metas_comerciales_tienda_rubro_idx
  on public.metas_comerciales_tienda (anio, rubro, mes, tienda_id);

alter table public.metas_comerciales_tienda
  drop constraint if exists metas_comerciales_tienda_rubro_check;

alter table public.metas_comerciales_tienda
  add constraint metas_comerciales_tienda_rubro_check
  check (rubro in ('', 'TEXTIL', 'CALZADO'));

create table if not exists public.metas_comerciales_anuales (
  anio smallint primary key check (anio between 2024 and 2100),
  meta_venta numeric(14,2) not null check (meta_venta >= 0),
  actualizado_por bigint references public.usuarios(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.metas_comerciales_anuales enable row level security;
revoke all on table public.metas_comerciales_anuales from anon, authenticated;

comment on table public.metas_comerciales_tienda is
  'Metas mensuales por tienda y rubro, administradas exclusivamente por Gerencia Comercial.';
comment on column public.metas_comerciales_tienda.rubro is
  'Vacío para la meta total de tienda; contiene el rubro para su desglose mensual.';
comment on table public.metas_comerciales_anuales is
  'Cache historico de la meta anual; las nuevas metas se calculan desde TEXTIL y CALZADO.';

create or replace view public.metas_comerciales_totales
with (security_invoker = true)
as
select
  tienda_id,
  anio,
  mes,
  sum(meta_venta)::numeric(14,2) as meta_venta,
  max(actualizado_en) as actualizado_en
from public.metas_comerciales_tienda
where rubro in ('TEXTIL', 'CALZADO')
group by tienda_id, anio, mes;

revoke all on table public.metas_comerciales_totales from anon, authenticated;
grant select on table public.metas_comerciales_totales to service_role;

comment on view public.metas_comerciales_totales is
  'Totales mensuales calculados; evita persistir una tercera copia inconsistente de TEXTIL + CALZADO.';
