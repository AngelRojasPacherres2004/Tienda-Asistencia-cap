BEGIN;

ALTER TABLE public.tiendas
  ADD COLUMN IF NOT EXISTS zonal_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tiendas_zonal_id_idx ON public.tiendas (zonal_id);

COMMIT;
