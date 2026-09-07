-- Amplía los estados de asistencia a 8 y agrega el log de auditoría (creación/edición/eliminación).
-- Ejecutar una sola vez en el SQL Editor del proyecto Supabase real.
BEGIN;

-- Defensivo: por si la migración 0002 nunca se llegó a ejecutar y todavía quedan
-- valores del modelo original (5 estados) que ya no existen en el nuevo set.
UPDATE asistencias SET estado = 'permiso' WHERE estado = 'justificado';
UPDATE asistencias SET estado = 'descanso_medico' WHERE estado = 'descanso';

ALTER TABLE asistencias DROP CONSTRAINT IF EXISTS asistencias_estado_check;
ALTER TABLE asistencias
  ADD CONSTRAINT asistencias_estado_check
  CHECK (estado IN ('presente', 'tardanza', 'medio_turno', 'apoyo', 'falta', 'permiso', 'descanso_medico', 'suspension'));
ALTER TABLE asistencias ALTER COLUMN observaciones TYPE VARCHAR(500);

CREATE TABLE log_asistencias (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
  tienda_id INTEGER NOT NULL REFERENCES tiendas (id),
  fecha DATE NOT NULL,
  operacion TEXT NOT NULL CHECK (operacion IN ('creacion', 'edicion', 'eliminacion')),
  estado_anterior TEXT,
  estado_nuevo TEXT,
  realizado_por INTEGER REFERENCES usuarios (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX log_asistencias_tienda_fecha_idx ON log_asistencias (tienda_id, created_at DESC);
ALTER TABLE log_asistencias ENABLE ROW LEVEL SECURITY;

COMMIT;
