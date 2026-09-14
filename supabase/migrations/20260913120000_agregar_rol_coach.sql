BEGIN;

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_rol_check,
  DROP CONSTRAINT IF EXISTS usuarios_tienda_rol_check;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_rol_check CHECK (
    rol IN ('admin', 'gerente', 'jefe_zonal', 'administrador_tienda', 'jefe_tienda', 'empleado', 'vendedor', 'seguridad', 'coach')
  ),
  ADD CONSTRAINT usuarios_tienda_rol_check CHECK (
    (rol IN ('admin', 'gerente', 'jefe_zonal', 'coach') AND tienda_id IS NULL) OR
    (rol IN ('administrador_tienda', 'jefe_tienda', 'empleado', 'vendedor', 'seguridad') AND tienda_id IS NOT NULL)
  );

ALTER TABLE public.capacitacion_progreso ALTER COLUMN tienda_id DROP NOT NULL;

COMMIT;
