BEGIN;

CREATE TABLE IF NOT EXISTS public.amonestaciones (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tipo_documento VARCHAR(30) NOT NULL CHECK (tipo_documento IN ('carta_amonestacion', 'memorandum', 'verbal')),
  descripcion TEXT NOT NULL,
  fecha DATE NOT NULL,
  creado_por INTEGER NOT NULL REFERENCES public.usuarios(id),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS amonestaciones_usuario_fecha_idx
  ON public.amonestaciones (usuario_id, fecha DESC);

ALTER TABLE public.amonestaciones ENABLE ROW LEVEL SECURITY;

COMMIT;
