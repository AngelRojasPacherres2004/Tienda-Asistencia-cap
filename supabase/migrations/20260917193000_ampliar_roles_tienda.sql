ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_tienda_rol_check;
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_rol_check CHECK (
    rol IN (
      'gerencia_general', 'gerente_comercial', 'coach', 'jefe_zonal',
      'jefe_tienda', 'asistente_tienda', 'jefe_seguridad', 'seguridad',
      'vendedor', 'asistente', 'trabajador'
    )
  );

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_tienda_rol_check CHECK (
    (rol IN ('gerencia_general', 'gerente_comercial', 'coach', 'jefe_zonal') AND tienda_id IS NULL)
    OR
    (rol IN ('jefe_tienda', 'asistente_tienda', 'jefe_seguridad', 'seguridad', 'vendedor', 'asistente', 'trabajador') AND tienda_id IS NOT NULL)
  );
