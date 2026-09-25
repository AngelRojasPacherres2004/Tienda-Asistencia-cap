ALTER TABLE public.capacitacion_progreso ADD COLUMN IF NOT EXISTS resultado text;
ALTER TABLE public.capacitacion_progreso DROP CONSTRAINT IF EXISTS capacitacion_progreso_resultado_check;
ALTER TABLE public.capacitacion_progreso ADD CONSTRAINT capacitacion_progreso_resultado_check CHECK (resultado IS NULL OR resultado IN ('aprobado', 'desaprobado', 'na'));
