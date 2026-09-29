CREATE TABLE IF NOT EXISTS public.notificaciones_asistencia_zonal (
  usuario_id integer PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  activo boolean NOT NULL DEFAULT false,
  registros boolean NOT NULL DEFAULT true,
  faltas boolean NOT NULL DEFAULT true,
  tardanzas boolean NOT NULL DEFAULT true,
  destinatarios text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(destinatarios) <= 20)
);
ALTER TABLE public.notificaciones_asistencia_zonal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notificaciones_asistencia_zonal FROM anon, authenticated;
GRANT ALL ON public.notificaciones_asistencia_zonal TO service_role;
