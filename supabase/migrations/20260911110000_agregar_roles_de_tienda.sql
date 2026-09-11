BEGIN;

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_rol_check,
  DROP CONSTRAINT IF EXISTS usuarios_tienda_rol_check;

-- El rol legado "asistente" ahora corresponde a "empleado".
UPDATE public.usuarios
SET rol = 'empleado'
WHERE rol = 'asistente';

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_rol_check CHECK (
    rol IN ('admin', 'gerente', 'jefe_zonal', 'administrador_tienda', 'jefe_tienda', 'empleado', 'vendedor', 'seguridad')
  ),
  ADD CONSTRAINT usuarios_tienda_rol_check CHECK (
    (rol IN ('admin', 'gerente', 'jefe_zonal') AND tienda_id IS NULL) OR
    (rol IN ('administrador_tienda', 'jefe_tienda', 'empleado', 'vendedor', 'seguridad') AND tienda_id IS NOT NULL)
  );

COMMIT;
