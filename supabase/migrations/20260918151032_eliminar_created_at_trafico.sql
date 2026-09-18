BEGIN;

-- Recupera la hora real de registro en Lima antes de retirar created_at.
UPDATE trafico_tienda
SET hora = (created_at AT TIME ZONE 'America/Lima')::TIME(0);

ALTER TABLE trafico_tienda
  DROP COLUMN IF EXISTS created_at;

COMMIT;
