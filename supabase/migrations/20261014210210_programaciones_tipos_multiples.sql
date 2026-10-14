BEGIN;
ALTER TABLE public.programaciones_asistencia_zonal
  ADD COLUMN IF NOT EXISTS tipos_reporte text[] NOT NULL DEFAULT ARRAY['asistencia']::text[]
    CHECK (cardinality(tipos_reporte) BETWEEN 1 AND 3
      AND array_ndims(tipos_reporte) = 1
      AND array_position(tipos_reporte, NULL) IS NULL
      AND tipos_reporte <@ ARRAY['asistencia','trafico','documentos']::text[]);

UPDATE public.programaciones_asistencia_zonal
SET tipos_reporte = CASE tipo_reporte
  WHEN 'todos' THEN ARRAY['asistencia','trafico','documentos']::text[]
  ELSE ARRAY[tipo_reporte]::text[] END
WHERE tipos_reporte = ARRAY['asistencia']::text[] AND tipo_reporte <> 'asistencia';

COMMENT ON COLUMN public.programaciones_asistencia_zonal.tipos_reporte
  IS 'Combinación elegida por programación: un correo separado por cada tipo seleccionado.';
COMMIT;
