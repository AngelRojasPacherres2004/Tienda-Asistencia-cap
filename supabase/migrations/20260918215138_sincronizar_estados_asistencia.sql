BEGIN;

-- La pantalla de asistencia y la API trabajan con estos ocho estados.
-- Se recrea la restricción para corregir proyectos que conservaron la versión
-- antigua de cuatro estados aunque la tabla y las demás migraciones existan.
ALTER TABLE public.asistencias
  DROP CONSTRAINT IF EXISTS asistencias_estado_check;

ALTER TABLE public.asistencias
  ADD CONSTRAINT asistencias_estado_check CHECK (
    estado IN (
      'presente', 'tardanza', 'medio_turno', 'apoyo',
      'falta', 'permiso', 'descanso_medico', 'suspension'
    )
  );

ALTER TABLE public.asistencias
  ALTER COLUMN observaciones TYPE varchar(500);

COMMIT;
