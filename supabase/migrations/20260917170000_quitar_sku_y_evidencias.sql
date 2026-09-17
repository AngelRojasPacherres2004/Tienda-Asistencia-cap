BEGIN;

ALTER TABLE IF EXISTS incidencia_productos
  DROP COLUMN IF EXISTS codigo_sku;

DROP TABLE IF EXISTS incidencia_evidencias;

COMMIT;
