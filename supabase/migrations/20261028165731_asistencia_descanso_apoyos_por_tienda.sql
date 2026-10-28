BEGIN;

ALTER TABLE public.asistencias DROP CONSTRAINT asistencias_estado_check;
ALTER TABLE public.asistencias ADD CONSTRAINT asistencias_estado_check CHECK (
  estado IN ('presente','tardanza','medio_turno','apoyo','apoyo_ingreso','descanso','falta','permiso','descanso_medico','suspension')
);
-- Preserve historical marks; allow an origin departure and a destination arrival.
ALTER TABLE public.asistencias DROP CONSTRAINT asistencias_usuario_id_fecha_key;
ALTER TABLE public.asistencias ADD CONSTRAINT asistencias_usuario_tienda_fecha_key UNIQUE (usuario_id,tienda_id,fecha);
-- A worker cannot count as physically present in two stores on the same day.
CREATE UNIQUE INDEX asistencias_presencia_usuario_fecha_ux ON public.asistencias(usuario_id,fecha)
  WHERE estado IN ('presente','tardanza','medio_turno','apoyo_ingreso');

-- Weekly employee schedules have no dependent modules. RESTRICT avoids removing dependencies.
DROP TABLE IF EXISTS public.horarios_trabajadores RESTRICT;
UPDATE public.personal_marketing SET perfil = perfil - 'horarios' WHERE perfil ? 'horarios';

NOTIFY pgrst, 'reload schema';
COMMIT;
