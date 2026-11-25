-- Detention remains a yes/no flag; the removed detail field is optional.
-- Preserve existing details for historical reports.
ALTER TABLE public.incidencias DROP CONSTRAINT IF EXISTS incidencias_detencion_detalle_check;
