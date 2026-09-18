BEGIN;

CREATE TABLE public.roles (
  codigo TEXT PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  nivel SMALLINT NOT NULL,
  ambito_tienda BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT roles_codigo_check CHECK (codigo ~ '^[a-z][a-z0-9_]*$')
);

INSERT INTO public.roles (codigo, nombre, nivel, ambito_tienda, orden) VALUES
  ('gerencia_general', 'Gerencia general', 100, false, 10),
  ('gerente_comercial', 'Gerente comercial', 90, false, 20),
  ('coach', 'Coach', 80, false, 30),
  ('jefe_zonal', 'Jefe zonal', 70, false, 40),
  ('jefe_tienda', 'Jefe de tienda', 60, true, 50),
  ('asistente_tienda', 'Asistente de tienda', 50, true, 60),
  ('jefe_seguridad', 'Jefe de seguridad', 45, true, 70),
  ('jefe_area', 'Jefe de área', 40, true, 80),
  ('seguridad', 'Seguridad', 30, true, 90),
  ('caja', 'Caja', 30, true, 100),
  ('almacenero', 'Almacenero', 30, true, 110),
  ('vendedor', 'Vendedor', 30, true, 120),
  ('asistente', 'Asistente', 30, true, 130),
  ('trabajador', 'Trabajador', 20, true, 140);

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_tienda_rol_check,
  DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_rol_fkey FOREIGN KEY (rol) REFERENCES public.roles(codigo),
  ADD CONSTRAINT usuarios_tienda_rol_check CHECK (
    (rol IN ('gerencia_general', 'gerente_comercial', 'coach', 'jefe_zonal') AND tienda_id IS NULL) OR
    (rol IN ('jefe_tienda', 'asistente_tienda', 'jefe_seguridad', 'jefe_area', 'seguridad', 'caja', 'almacenero', 'vendedor', 'asistente', 'trabajador') AND tienda_id IS NOT NULL)
  );

ALTER TABLE public.usuarios DROP COLUMN IF EXISTS puesto;
ALTER TABLE public.horarios_trabajadores DROP COLUMN IF EXISTS observacion;

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.roles FROM anon, authenticated;
GRANT SELECT ON TABLE public.roles TO service_role;

COMMENT ON TABLE public.roles IS 'Catálogo central de roles disponibles para los usuarios.';

COMMIT;
