BEGIN;

INSERT INTO public.roles (codigo, nombre, nivel, ambito_tienda, activo, orden)
VALUES ('asistente_comercial', 'Asistente comercial', 45, false, true, 55)
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  nivel = EXCLUDED.nivel,
  ambito_tienda = false,
  activo = true,
  orden = EXCLUDED.orden;

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_tienda_rol_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_tienda_rol_check CHECK (
  (rol IN (
    'gerencia_general', 'gerente_comercial', 'administrador_seguridad',
    'sistemas', 'asistente_comercial', 'marketing', 'coach', 'jefe_zonal'
  ) AND tienda_id IS NULL)
  OR (rol IN (
    'jefe_tienda', 'asistente_tienda', 'jefe_seguridad', 'jefe_area',
    'seguridad', 'caja', 'almacenero', 'vendedor', 'asistente', 'trabajador'
  ) AND tienda_id IS NOT NULL)
);

COMMIT;
