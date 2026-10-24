-- No retirar índices por similitud estructural únicamente. Antes de hacerlo,
-- medir las consultas reales con EXPLAIN/pg_stat_statements e Index Advisor.
-- La limpieza de índices tendrá una migración propia y una prueba de regresión.

-- trafico_tienda recibe cargas y conciliaciones frecuentes. Umbrales menores
-- evitan acumular miles de versiones muertas antes del autovacuum por defecto.
alter table if exists public.trafico_tienda set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

comment on table public.trafico_tienda is
  'Tráfico horario por tienda; autovacuum ajustado para cargas frecuentes.';
