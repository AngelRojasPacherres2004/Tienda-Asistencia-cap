ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS contacto_emergencia TEXT,
  ADD COLUMN IF NOT EXISTS motivo_salida TEXT;

COMMENT ON COLUMN public.usuarios.contacto_emergencia IS 'Nombres y apellidos del contacto de emergencia.';
COMMENT ON COLUMN public.usuarios.motivo_salida IS 'Motivo registrado al finalizar la relación laboral.';
