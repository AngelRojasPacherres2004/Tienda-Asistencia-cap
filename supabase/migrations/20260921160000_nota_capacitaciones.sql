BEGIN;

ALTER TABLE public.capacitacion_progreso
  ADD COLUMN IF NOT EXISTS nota NUMERIC(4,2)
  CHECK (nota IS NULL OR (nota >= 0 AND nota <= 20));

COMMIT;
