-- Cambia los estados de asistencia a: presente (Asistencia), falta, medio_turno, permiso.
-- Ejecutar una sola vez en el SQL Editor del proyecto Supabase real.
BEGIN;

-- Reasigna cualquier dato existente con los estados anteriores a los nuevos.
UPDATE asistencias SET estado = 'medio_turno' WHERE estado = 'tardanza';
UPDATE asistencias SET estado = 'permiso' WHERE estado = 'justificado';
UPDATE asistencias SET estado = 'falta' WHERE estado = 'descanso';

ALTER TABLE asistencias DROP CONSTRAINT IF EXISTS asistencias_estado_check;
ALTER TABLE asistencias
  ADD CONSTRAINT asistencias_estado_check
  CHECK (estado IN ('presente', 'falta', 'medio_turno', 'permiso'));

COMMIT;
