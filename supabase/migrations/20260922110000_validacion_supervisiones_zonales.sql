BEGIN;

ALTER TABLE public.observaciones_zonales
  ADD COLUMN IF NOT EXISTS validado_por BIGINT REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comentario_validacion TEXT,
  ADD COLUMN IF NOT EXISTS fecha_validacion TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS observaciones_zonales_validacion_idx
  ON public.observaciones_zonales(tienda_id, estado, fecha_validacion DESC);

COMMIT;
