BEGIN;

ALTER TABLE trafico_tienda
  ADD COLUMN IF NOT EXISTS rango_hora TEXT;

-- Conserva los registros existentes asignándolos al rango que contiene su hora.
UPDATE trafico_tienda
SET rango_hora = CASE
  WHEN hora < TIME '10:00' THEN '09:00-10:00'
  WHEN hora >= TIME '21:00' THEN '21:00-22:00'
  ELSE lpad(extract(hour FROM hora)::INTEGER::TEXT, 2, '0') || ':00-' ||
       lpad((extract(hour FROM hora)::INTEGER + 1)::TEXT, 2, '0') || ':00'
END
WHERE rango_hora IS NULL;

ALTER TABLE trafico_tienda
  ALTER COLUMN rango_hora SET NOT NULL,
  DROP CONSTRAINT IF EXISTS trafico_tienda_tienda_id_fecha_key,
  DROP CONSTRAINT IF EXISTS trafico_tienda_rango_hora_check;

ALTER TABLE trafico_tienda
  ADD CONSTRAINT trafico_tienda_rango_hora_check CHECK (
    rango_hora IN (
      '09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00',
      '13:00-14:00', '14:00-15:00', '15:00-16:00', '16:00-17:00',
      '17:00-18:00', '18:00-19:00', '19:00-20:00', '20:00-21:00',
      '21:00-22:00'
    )
  ),
  ADD CONSTRAINT trafico_tienda_tienda_fecha_rango_key
    UNIQUE (tienda_id, fecha, rango_hora);

COMMIT;
