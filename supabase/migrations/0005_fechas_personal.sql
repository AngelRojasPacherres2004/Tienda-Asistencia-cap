-- Fechas laborales para calcular rotacion y conservar el historial del personal.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS fecha_ingreso DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS fecha_salida DATE;

ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS usuarios_fechas_laborales_check;

ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_fechas_laborales_check
  CHECK (fecha_salida IS NULL OR fecha_salida >= fecha_ingreso);
