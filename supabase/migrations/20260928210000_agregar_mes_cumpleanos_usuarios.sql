ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS mes_cumpleanos char(2);

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_mes_cumpleanos_check;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_mes_cumpleanos_check
  CHECK (mes_cumpleanos IS NULL OR mes_cumpleanos ~ '^(0[1-9]|1[0-2])$');

UPDATE public.usuarios
SET mes_cumpleanos = to_char(fecha_nacimiento, 'MM')
WHERE mes_cumpleanos IS NULL AND fecha_nacimiento IS NOT NULL;
