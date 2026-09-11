CREATE TABLE IF NOT EXISTS public.incidentes (
  id SERIAL PRIMARY KEY,
  titulo TEXT NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 3 AND 150),
  descripcion TEXT NOT NULL CHECK (char_length(btrim(descripcion)) BETWEEN 5 AND 3000),
  reportado_por INTEGER NOT NULL,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT incidentes_reportado_por_fkey
    FOREIGN KEY (reportado_por) REFERENCES public.usuarios (id)
);

CREATE INDEX IF NOT EXISTS incidentes_fecha_creacion_idx
  ON public.incidentes (fecha_creacion DESC);

ALTER TABLE public.incidentes ENABLE ROW LEVEL SECURITY;
