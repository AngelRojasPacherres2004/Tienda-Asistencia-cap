BEGIN;
ALTER TABLE public.programaciones_asistencia_zonal
  ADD COLUMN IF NOT EXISTS tipo_reporte text NOT NULL DEFAULT 'asistencia'
    CHECK (tipo_reporte IN ('asistencia', 'documentos', 'trafico', 'todos'));
ALTER TABLE public.envios_asistencia_zonal
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'asistencia'
    CHECK (categoria IN ('asistencia', 'documentos', 'trafico'));
DROP INDEX IF EXISTS public.envios_asistencia_unico_automatico_idx;
CREATE UNIQUE INDEX envios_asistencia_unico_automatico_idx
  ON public.envios_asistencia_zonal(programacion_id, fecha, categoria)
  WHERE tipo = 'automatico';

-- Los avisos anteriores se sustituyen por programaciones explícitas.
-- Conservamos las preferencias y el historial para no perder datos.
UPDATE public.notificaciones_asistencia_zonal SET activo = false, updated_at = now() WHERE activo;
COMMENT ON COLUMN public.programaciones_asistencia_zonal.tipo_reporte
  IS 'Tipo de reporte; todos genera tres correos independientes a la misma hora.';
COMMENT ON COLUMN public.envios_asistencia_zonal.categoria
  IS 'Cada correo tiene su estado y control de duplicados independiente.';
COMMIT;
