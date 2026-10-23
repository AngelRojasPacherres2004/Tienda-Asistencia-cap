-- La clave única (tienda_id, fecha, rango_hora) ya cubre las búsquedas por
-- tienda y fecha. Estos dos índices repetían sus prefijos y ocupaban ~1.6 MB.
drop index if exists public.trafico_tienda_fecha_idx;
drop index if exists public.idx_trafico_tienda_tienda;

-- trafico_tienda recibe cargas y conciliaciones frecuentes. Umbrales menores
-- evitan acumular miles de versiones muertas antes del autovacuum por defecto.
alter table if exists public.trafico_tienda set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

comment on table public.trafico_tienda is
  'Tráfico horario por tienda. La clave única tienda/fecha/rango cubre las consultas operativas; autovacuum ajustado para cargas frecuentes.';
