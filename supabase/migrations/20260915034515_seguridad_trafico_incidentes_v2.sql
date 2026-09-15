BEGIN;

CREATE TABLE IF NOT EXISTS public.trafico_tienda (
  id BIGSERIAL PRIMARY KEY,
  tienda_id INTEGER NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  cantidad INTEGER NOT NULL CHECK (cantidad >= 0),
  observaciones TEXT,
  registrado_por INTEGER NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tienda_id, fecha)
);

CREATE INDEX IF NOT EXISTS trafico_tienda_fecha_idx ON public.trafico_tienda(tienda_id, fecha DESC);
ALTER TABLE public.trafico_tienda ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.incidentes ADD COLUMN IF NOT EXISTS tienda_id INTEGER REFERENCES public.tiendas(id) ON DELETE CASCADE;
ALTER TABLE public.incidentes ADD COLUMN IF NOT EXISTS codigo TEXT;
ALTER TABLE public.incidentes ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'Otro';
ALTER TABLE public.incidentes ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE public.incidentes ADD COLUMN IF NOT EXISTS severidad TEXT NOT NULL DEFAULT 'media' CHECK (severidad IN ('baja','media','alta','critica'));
ALTER TABLE public.incidentes ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('borrador','abierta','revision','cerrada'));
ALTER TABLE public.incidentes ADD COLUMN IF NOT EXISTS fecha DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.incidentes ADD COLUMN IF NOT EXISTS hora TIME NOT NULL DEFAULT LOCALTIME;
ALTER TABLE public.incidentes ADD COLUMN IF NOT EXISTS intervencion BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.incidentes ADD COLUMN IF NOT EXISTS detencion BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.incidentes ADD COLUMN IF NOT EXISTS productos JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.incidentes ADD COLUMN IF NOT EXISTS personas JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.incidentes ADD COLUMN IF NOT EXISTS evidencias JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.incidentes i SET tienda_id = u.tienda_id
FROM public.usuarios u WHERE i.reportado_por = u.id AND i.tienda_id IS NULL;
UPDATE public.incidentes SET codigo = 'INC-' || EXTRACT(YEAR FROM fecha_creacion)::INTEGER || '-' || LPAD(id::TEXT, 4, '0') WHERE codigo IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS incidentes_codigo_ux ON public.incidentes(codigo);
CREATE INDEX IF NOT EXISTS incidentes_tienda_fecha_idx ON public.incidentes(tienda_id, fecha DESC);

COMMIT;
