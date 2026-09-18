BEGIN;

-- La unicidad correcta es tienda + fecha + rango_hora.
-- Esta restricción antigua impedía registrar más de un rango en el mismo día.
ALTER TABLE trafico_tienda
  DROP CONSTRAINT IF EXISTS trafico_tienda_tienda_fecha_key,
  DROP CONSTRAINT IF EXISTS trafico_tienda_tienda_id_fecha_key;

COMMIT;
