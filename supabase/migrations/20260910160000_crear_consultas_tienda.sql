CREATE TABLE IF NOT EXISTS public.consultas_tienda (
  id BIGSERIAL PRIMARY KEY,
  tienda_id INTEGER REFERENCES public.tiendas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('marca', 'lote', 'guia', 'rms')),
  codigo TEXT NOT NULL CHECK (char_length(codigo) BETWEEN 1 AND 100),
  descripcion TEXT NOT NULL CHECK (char_length(descripcion) BETWEEN 1 AND 500),
  rubro TEXT,
  estado TEXT NOT NULL,
  fuente TEXT NOT NULL DEFAULT 'Maestro',
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tienda_id, tipo, codigo)
);

CREATE INDEX IF NOT EXISTS consultas_tienda_busqueda_idx
  ON public.consultas_tienda (tipo, tienda_id, rubro);

ALTER TABLE public.consultas_tienda ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.consultas_tienda IS
  'Datos maestros e importados de solo consulta para administradores de tienda.';
