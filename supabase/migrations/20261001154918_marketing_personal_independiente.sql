BEGIN;

CREATE TABLE IF NOT EXISTS public.personal_marketing (
  id BIGSERIAL PRIMARY KEY,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  dni VARCHAR(12) NOT NULL,
  telefono VARCHAR(15),
  email TEXT,
  rol TEXT NOT NULL CHECK (rol IN ('coordinador_marketing','analista_marketing','disenador','community_manager','productor_contenido','promotor_marketing')),
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
  fecha_ingreso DATE NOT NULL,
  creado_por INTEGER NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creado_por, dni)
);

CREATE TABLE IF NOT EXISTS public.asistencias_marketing (
  id BIGSERIAL PRIMARY KEY,
  personal_id BIGINT NOT NULL REFERENCES public.personal_marketing(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('presente','tardanza','falta','permiso','descanso_medico')),
  observaciones TEXT,
  registrado_por INTEGER NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (personal_id, fecha)
);

CREATE TABLE IF NOT EXISTS public.validaciones_marketing (
  id BIGSERIAL PRIMARY KEY,
  campana_id BIGINT NOT NULL REFERENCES public.campanas_marketing(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  presupuesto NUMERIC(14,2) NOT NULL CHECK (presupuesto >= 0),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','observada','rechazada')),
  registrado_por INTEGER NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.capacitaciones_marketing (
  id BIGSERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  fecha DATE NOT NULL,
  instructor TEXT,
  estado TEXT NOT NULL DEFAULT 'programada' CHECK (estado IN ('programada','realizada','cancelada')),
  personal_ids BIGINT[] NOT NULL DEFAULT '{}',
  creado_por INTEGER NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.amonestaciones_marketing (
  id BIGSERIAL PRIMARY KEY,
  personal_id BIGINT NOT NULL REFERENCES public.personal_marketing(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('verbal','carta_amonestacion','memorandum')),
  motivo TEXT NOT NULL,
  fecha DATE NOT NULL,
  registrado_por INTEGER NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.errores_marketing (
  id BIGSERIAL PRIMARY KEY,
  personal_id BIGINT NOT NULL REFERENCES public.personal_marketing(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('contenido','liberado')),
  error TEXT NOT NULL,
  fecha DATE NOT NULL,
  registrado_por INTEGER NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS personal_marketing_creador_idx ON public.personal_marketing(creado_por, estado);
CREATE INDEX IF NOT EXISTS asistencias_marketing_fecha_idx ON public.asistencias_marketing(fecha DESC);
CREATE INDEX IF NOT EXISTS validaciones_marketing_campana_idx ON public.validaciones_marketing(campana_id);
CREATE INDEX IF NOT EXISTS capacitaciones_marketing_fecha_idx ON public.capacitaciones_marketing(fecha DESC);
CREATE INDEX IF NOT EXISTS amonestaciones_marketing_personal_idx ON public.amonestaciones_marketing(personal_id, fecha DESC);
CREATE INDEX IF NOT EXISTS errores_marketing_personal_idx ON public.errores_marketing(personal_id, fecha DESC);

ALTER TABLE public.personal_marketing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asistencias_marketing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validaciones_marketing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacitaciones_marketing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amonestaciones_marketing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.errores_marketing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.personal_marketing, public.asistencias_marketing, public.validaciones_marketing, public.capacitaciones_marketing, public.amonestaciones_marketing, public.errores_marketing FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.personal_marketing, public.asistencias_marketing, public.validaciones_marketing, public.capacitaciones_marketing, public.amonestaciones_marketing, public.errores_marketing TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

COMMIT;
