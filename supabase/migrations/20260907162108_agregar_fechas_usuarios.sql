ALTER TABLE usuarios
  ADD COLUMN fecha_ingreso DATE,
  ADD COLUMN fecha_salida DATE;

UPDATE usuarios
SET fecha_ingreso = fecha_creacion::date
WHERE fecha_ingreso IS NULL;

ALTER TABLE usuarios
  ALTER COLUMN fecha_ingreso SET NOT NULL,
  ALTER COLUMN fecha_ingreso SET DEFAULT CURRENT_DATE;

ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_fechas_check
  CHECK (fecha_salida IS NULL OR fecha_salida >= fecha_ingreso);
