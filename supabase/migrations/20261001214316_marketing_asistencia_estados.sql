BEGIN;
ALTER TABLE public.asistencias_marketing DROP CONSTRAINT IF EXISTS asistencias_marketing_estado_check;
ALTER TABLE public.asistencias_marketing ADD CONSTRAINT asistencias_marketing_estado_check CHECK (estado IN ('presente','tardanza','medio_turno','apoyo','falta','permiso','descanso_medico','suspension'));
COMMIT;
