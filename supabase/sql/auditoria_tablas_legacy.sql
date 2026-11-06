-- Auditoría segura previa a retirar tablas históricas.
-- Ejecutar con una cuenta de lectura antes de programar cualquier DROP.
-- Este archivo no borra nada y evita romper referencias del front/back.

select c.relname as tabla, c.reltuples::bigint as filas_estimadas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'bitacora_tienda', 'horarios_trabajadores', 'cobertura_trabajadores',
    'consultas_tienda', 'documentos_legales_tienda', 'mejoras_continuas',
    'incidentes', 'tienda_jefes_zonales_legacy',
    'notificaciones_asistencia', 'notificaciones_asistencia_envios'
  )
order by c.relname;

select tc.table_name, tc.constraint_name, tc.constraint_type
from information_schema.table_constraints tc
where tc.constraint_schema = 'public'
  and tc.table_name in (
    'bitacora_tienda', 'horarios_trabajadores', 'cobertura_trabajadores',
    'consultas_tienda', 'documentos_legales_tienda', 'mejoras_continuas',
    'incidentes', 'tienda_jefes_zonales_legacy',
    'notificaciones_asistencia', 'notificaciones_asistencia_envios'
  )
order by tc.table_name, tc.constraint_name;

-- No ejecutar automáticamente:
-- 1) exportar/respaldar las tablas con filas;
-- 2) verificar funciones, RLS, triggers, vistas y clientes externos;
-- 3) retirar referencias del código y recién entonces eliminar en una ventana
--    de mantenimiento. bitacora_tienda queda marcada como candidata, no como
--    tabla eliminable, hasta completar esas comprobaciones.
