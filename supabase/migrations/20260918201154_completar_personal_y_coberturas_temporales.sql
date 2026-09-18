BEGIN;

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS nacionalidad TEXT,
  ADD COLUMN IF NOT EXISTS area_laboral TEXT,
  ADD COLUMN IF NOT EXISTS carrera TEXT;

CREATE TABLE public.coberturas_especiales (
  id BIGSERIAL PRIMARY KEY,
  tienda_destino_id INTEGER NOT NULL REFERENCES public.tiendas(id),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  tipo_dia TEXT NOT NULL CHECK (tipo_dia IN ('sabado', 'domingo', 'feriado', 'especial')),
  motivo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'confirmada', 'cancelada')),
  creado_por INTEGER NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coberturas_fechas_check CHECK (fecha_fin >= fecha_inicio)
);

CREATE TABLE public.cobertura_trabajadores (
  id BIGSERIAL PRIMARY KEY,
  cobertura_id BIGINT NOT NULL REFERENCES public.coberturas_especiales(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES public.usuarios(id),
  area TEXT,
  hora_entrada TIME NOT NULL,
  tipo_cobertura TEXT NOT NULL CHECK (tipo_cobertura IN ('fijo', 'apoyo')),
  tienda_origen_id INTEGER NOT NULL REFERENCES public.tiendas(id),
  tienda_destino_id INTEGER NOT NULL REFERENCES public.tiendas(id),
  observacion TEXT,
  CONSTRAINT cobertura_trabajador_ux UNIQUE (cobertura_id, usuario_id)
);

CREATE INDEX coberturas_tienda_fechas_idx ON public.coberturas_especiales(tienda_destino_id, fecha_inicio, fecha_fin);
CREATE INDEX coberturas_creado_por_idx ON public.coberturas_especiales(creado_por);
CREATE INDEX cobertura_trabajadores_usuario_idx ON public.cobertura_trabajadores(usuario_id);
CREATE INDEX cobertura_trabajadores_origen_idx ON public.cobertura_trabajadores(tienda_origen_id);
CREATE INDEX cobertura_trabajadores_destino_idx ON public.cobertura_trabajadores(tienda_destino_id);

ALTER TABLE public.coberturas_especiales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobertura_trabajadores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.coberturas_especiales, public.cobertura_trabajadores FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coberturas_especiales, public.cobertura_trabajadores TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.coberturas_especiales_id_seq, public.cobertura_trabajadores_id_seq TO service_role;

COMMIT;
