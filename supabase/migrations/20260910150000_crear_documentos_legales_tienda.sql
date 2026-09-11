CREATE TABLE IF NOT EXISTS public.documentos_legales_tienda (
  id SERIAL PRIMARY KEY,
  tienda_id INTEGER NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  documento TEXT NOT NULL CHECK (char_length(documento) BETWEEN 3 AND 160),
  referencia TEXT NOT NULL CHECK (char_length(referencia) BETWEEN 2 AND 100),
  fecha_emision DATE NOT NULL,
  fecha_vencimiento DATE,
  archivo_path TEXT NOT NULL UNIQUE,
  archivo_nombre TEXT NOT NULL,
  subido_por INTEGER NOT NULL REFERENCES public.usuarios(id),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT documentos_legales_fechas_validas
    CHECK (fecha_vencimiento IS NULL OR fecha_vencimiento >= fecha_emision)
);

CREATE INDEX IF NOT EXISTS documentos_legales_tienda_idx
  ON public.documentos_legales_tienda (tienda_id, fecha_vencimiento);

ALTER TABLE public.documentos_legales_tienda ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentos-legales-tienda',
  'documentos-legales-tienda',
  false,
  4194304,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
