ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS condicion_salud TEXT;

COMMENT ON COLUMN public.usuarios.condicion_salud IS
  'Tratamientos, restricciones o consideraciones médicas relevantes del trabajador.';
