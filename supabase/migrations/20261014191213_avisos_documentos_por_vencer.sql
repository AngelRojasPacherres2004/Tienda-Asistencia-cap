ALTER TABLE public.notificaciones_asistencia_zonal
  ADD COLUMN IF NOT EXISTS documentos_por_vencer boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.notificaciones_asistencia_zonal.documentos_por_vencer
  IS 'Resumen diario de documentos dentro de los días de alerta configurados, incluida la fecha de vencimiento.';
COMMENT ON TABLE public.envios_documentos_vencidos_zonal
  IS 'Control de un resumen documental por usuario y fecha de Lima, para zonales y gerencia general.';
