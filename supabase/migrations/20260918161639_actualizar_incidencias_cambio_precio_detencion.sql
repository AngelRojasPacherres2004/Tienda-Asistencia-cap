BEGIN;

ALTER TABLE incidencias
  ADD COLUMN IF NOT EXISTS detencion_detalle TEXT;

UPDATE incidencias
SET gravedad = 'alta'
WHERE gravedad = 'critica';

UPDATE incidencias
SET detencion_detalle = 'Detalle no registrado'
WHERE detencion = true
  AND btrim(coalesce(detencion_detalle, '')) = '';

ALTER TABLE incidencias
  DROP CONSTRAINT IF EXISTS incidencias_tipo_check,
  DROP CONSTRAINT IF EXISTS incidencias_gravedad_check,
  DROP CONSTRAINT IF EXISTS incidencias_detencion_detalle_check;

ALTER TABLE incidencias
  ADD CONSTRAINT incidencias_tipo_check CHECK (
    tipo IN ('robo', 'robo_frustrado', 'cambio_precio', 'accidente', 'dano', 'conflicto', 'otro')
  ),
  ADD CONSTRAINT incidencias_gravedad_check CHECK (
    gravedad IN ('baja', 'media', 'alta')
  ),
  ADD CONSTRAINT incidencias_detencion_detalle_check CHECK (
    detencion = false OR btrim(coalesce(detencion_detalle, '')) <> ''
  );

COMMIT;
