ALTER TABLE public.notificaciones_asistencia_zonal
  ADD COLUMN IF NOT EXISTS trafico boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS documentos_vencidos boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.envios_documentos_vencidos_zonal (
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  enviado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, fecha)
);
ALTER TABLE public.envios_documentos_vencidos_zonal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.envios_documentos_vencidos_zonal FROM anon, authenticated;
GRANT ALL ON public.envios_documentos_vencidos_zonal TO service_role;
