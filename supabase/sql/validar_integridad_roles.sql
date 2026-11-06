-- Validación de integridad de roles antes de aplicar cambios.
-- Debe devolver cero filas en las dos primeras consultas.

-- No puede existir más de un jefe de tienda por tienda.
select tienda_id, count(*) as jefes_activos
from public.usuarios
where rol = 'jefe_tienda'
  and estado = 'activo'
group by tienda_id
having count(*) > 1;

-- Revisión estricta incluyendo históricos, porque el índice actual protege
-- también las fichas inactivas y evita duplicados de la misma tienda.
select tienda_id, count(*) as jefes_registrados
from public.usuarios
where rol = 'jefe_tienda'
group by tienda_id
having count(*) > 1;

-- El back y la base deben conservar esta defensa única.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'usuarios'
  and indexname = 'usuarios_jefe_tienda_unico_idx';
