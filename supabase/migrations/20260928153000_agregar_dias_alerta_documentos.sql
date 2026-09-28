ALTER TABLE public.documentos_municipales
  ADD COLUMN IF NOT EXISTS dias_alerta integer NOT NULL DEFAULT 30;

ALTER TABLE public.documentos_municipales
  DROP CONSTRAINT IF EXISTS documentos_municipales_dias_alerta_check;

ALTER TABLE public.documentos_municipales
  ADD CONSTRAINT documentos_municipales_dias_alerta_check
  CHECK (dias_alerta BETWEEN 1 AND 365);

UPDATE public.documentos_municipales
SET dias_alerta = 30
WHERE dias_alerta IS NULL;
