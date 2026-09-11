BEGIN;

CREATE TABLE IF NOT EXISTS public.notificaciones_asistencia (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL CHECK (char_length(nombre) BETWEEN 3 AND 120),
  hora TIME NOT NULL,
  asunto TEXT NOT NULL CHECK (char_length(asunto) BETWEEN 3 AND 200),
  destinatarios TEXT[] NOT NULL CHECK (cardinality(destinatarios) BETWEEN 1 AND 20),
  alcance TEXT NOT NULL DEFAULT 'todos' CHECK (alcance IN ('todos', 'especificos')),
  usuario_ids BIGINT[] NOT NULL DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_por INTEGER NOT NULL REFERENCES public.usuarios(id),
  eliminado_at TIMESTAMPTZ,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (alcance = 'todos' OR cardinality(usuario_ids) > 0)
);

CREATE TABLE IF NOT EXISTS public.notificaciones_asistencia_envios (
  id BIGSERIAL PRIMARY KEY,
  programacion_id BIGINT NOT NULL REFERENCES public.notificaciones_asistencia(id),
  fecha_reporte DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('automatico', 'manual')),
  estado TEXT NOT NULL CHECK (estado IN ('procesando', 'enviado', 'error', 'requiere_revision')),
  destinatarios TEXT[] NOT NULL,
  asistentes INTEGER NOT NULL DEFAULT 0,
  ausentes INTEGER NOT NULL DEFAULT 0,
  intentos INTEGER NOT NULL DEFAULT 1 CHECK (intentos BETWEEN 1 AND 3),
  error TEXT,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_envio TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS notificacion_automatica_diaria_ux
  ON public.notificaciones_asistencia_envios (programacion_id, fecha_reporte)
  WHERE tipo = 'automatico';
CREATE INDEX IF NOT EXISTS notificaciones_envios_recientes_idx
  ON public.notificaciones_asistencia_envios (fecha_creacion DESC);

ALTER TABLE public.notificaciones_asistencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones_asistencia_envios ENABLE ROW LEVEL SECURITY;

COMMIT;
