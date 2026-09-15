BEGIN;
CREATE TABLE IF NOT EXISTS public.metas_comerciales (
  id BIGSERIAL PRIMARY KEY,
  tienda_id INTEGER NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  periodo CHAR(7) NOT NULL CHECK (periodo ~ '^\d{4}-\d{2}$'),
  nombre TEXT NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 3 AND 160),
  objetivo NUMERIC(14,2) NOT NULL CHECK (objetivo >= 0),
  resultado NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (resultado >= 0),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','cumplida')),
  creado_por INTEGER NOT NULL REFERENCES public.usuarios(id),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tienda_id, periodo, nombre)
);
CREATE INDEX IF NOT EXISTS metas_comerciales_periodo_idx ON public.metas_comerciales(periodo DESC, tienda_id);
ALTER TABLE public.metas_comerciales ENABLE ROW LEVEL SECURITY;
COMMIT;
