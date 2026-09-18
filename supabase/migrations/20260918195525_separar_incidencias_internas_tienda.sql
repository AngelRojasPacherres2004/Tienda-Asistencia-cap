BEGIN;

ALTER TABLE public.incidencias
  DROP CONSTRAINT IF EXISTS incidencias_tipo_check;

UPDATE public.incidencias
SET tipo = 'dano_infraestructura'
WHERE tipo = 'dano';

UPDATE public.incidencias
SET tipo = 'problema_operativo'
WHERE tipo = 'conflicto';

ALTER TABLE public.incidencias
  ADD CONSTRAINT incidencias_tipo_check CHECK (
    tipo IN (
      'robo', 'robo_frustrado', 'cambio_precio',
      'accidente', 'dano_infraestructura', 'problema_operativo',
      'falla_interna', 'otro'
    )
  );

COMMIT;
