-- Alinea public.tiendas con el catálogo TIENDAS.xlsx usado para el corte.
-- No elimina personas ni historial: solo retira asignaciones activas de
-- tiendas fuera del catálogo operativo y conserva sus fichas como inactivas.

update public.tiendas
set estado = 'inactivo', jefe_id = null
where upper(trim(nombre)) in ('CAJAMARCA', 'COLONIAL');

update public.tiendas
set jefe_id = null
where upper(trim(nombre)) = 'PUNO';

update public.usuarios u
set estado = 'inactivo',
    fecha_salida = coalesce(fecha_salida, date '2026-11-05'),
    motivo_salida = coalesce(nullif(btrim(motivo_salida), ''), 'OTRO')
from public.tiendas t
where u.tienda_id = t.id
  and u.rol = 'jefe_tienda'
  and upper(trim(t.nombre)) in ('PUNO', 'CAJAMARCA', 'COLONIAL');
