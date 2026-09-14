BEGIN;

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_rol_check,
  DROP CONSTRAINT IF EXISTS usuarios_tienda_rol_check;

UPDATE public.usuarios SET rol = 'admin', rol_personal = 'administrador', tienda_id = NULL
WHERE rol = 'gerente';

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_rol_check CHECK (
    rol IN ('admin', 'jefe_zonal', 'administrador_tienda', 'jefe_tienda', 'empleado', 'vendedor', 'seguridad', 'coach')
  ),
  ADD CONSTRAINT usuarios_tienda_rol_check CHECK (
    (rol IN ('admin', 'jefe_zonal', 'coach') AND tienda_id IS NULL) OR
    (rol IN ('administrador_tienda', 'jefe_tienda', 'empleado', 'vendedor', 'seguridad') AND tienda_id IS NOT NULL)
  );

INSERT INTO public.usuarios (nombres, apellidos, dni, usuario, password, rol, rol_personal, tienda_id, estado, fecha_ingreso)
SELECT 'Administrador', 'Sistema', '91000001', 'admin.roles', '$2b$12$5WiT.MI.AcY8M3kC0L7rI.xHEhVFtFCjMYxE2nHlb5YPhtI3R2CLm', 'admin', 'administrador', NULL, 'activo', CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM public.usuarios WHERE lower(usuario) = 'admin.roles' OR dni = '91000001');

INSERT INTO public.usuarios (nombres, apellidos, dni, usuario, password, rol, rol_personal, tienda_id, estado, fecha_ingreso)
SELECT 'Jefe', 'Zonal Demo', '91000002', 'zonal.roles', '$2b$12$tUlkOOO3XsoD2tQTi2sBpuBIXklWIvTuZfytc5eM3RHzO0gIb.W5O', 'jefe_zonal', 'administrador', NULL, 'activo', CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM public.usuarios WHERE lower(usuario) = 'zonal.roles' OR dni = '91000002');

INSERT INTO public.usuarios (nombres, apellidos, dni, usuario, password, rol, rol_personal, tienda_id, estado, fecha_ingreso)
SELECT 'Coach', 'Capacitaciones', '91000008', 'coach.roles', '$2b$12$RU72JAfo/vJxdHwNApHSwOvjngS8LVFvPDv6F4kEpQDcr6bXpUV.u', 'coach', 'otros', NULL, 'activo', CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM public.usuarios WHERE lower(usuario) = 'coach.roles' OR dni = '91000008');

INSERT INTO public.tiendas (nombre, direccion, estado, zonal_id)
SELECT 'Tienda Roles Demo', 'Lima', 'activo', (SELECT id FROM public.usuarios WHERE lower(usuario) = 'zonal.roles' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM public.tiendas WHERE lower(nombre) = 'tienda roles demo');

INSERT INTO public.usuarios (nombres, apellidos, dni, usuario, password, rol, rol_personal, tienda_id, estado, fecha_ingreso)
SELECT seed.nombres, seed.apellidos, seed.dni, seed.usuario, seed.password, seed.rol, seed.rol_personal, tienda.id, 'activo', CURRENT_DATE
FROM (VALUES
  ('Administrador', 'De Tienda', '91000003', 'tienda.roles', '$2b$12$1xB2.E.GG0TbmLvJ33Fmued1jLWUjAndjxObXwxCPDNr3oAnZjL4m', 'administrador_tienda', 'administrador'),
  ('Jefe', 'De Tienda', '91000004', 'lider.roles', '$2b$12$EV42us3Mg6vyPgUVwBwXEe9m0ChXUXQ44pQvdLK..f/zzdYvvLST.', 'jefe_tienda', 'lider_equipo'),
  ('Empleado', 'Demo', '91000005', 'empleado.roles', '$2b$12$c/7mXD2JE6hWjvAZsxU7KukiQ1irUgOoqHeDQ0umUVEZZk3KGTiUe', 'empleado', 'operante'),
  ('Vendedor', 'Demo', '91000006', 'vendedor.roles', '$2b$12$EmOiXARJpQl.G8w7Rx.5L.lv5zZ1zWPoGQStakSDXLekyriQAsO3.', 'vendedor', 'operante'),
  ('Seguridad', 'Demo', '91000007', 'seguridad.roles', '$2b$12$UYgcD7Vk9qwRn86ZI2d4pOLEoJofRUVLB.Z3BI531MddPLLEctRBy', 'seguridad', 'otros')
) AS seed(nombres, apellidos, dni, usuario, password, rol, rol_personal)
CROSS JOIN LATERAL (SELECT id FROM public.tiendas WHERE lower(nombre) = 'tienda roles demo' LIMIT 1) tienda
WHERE NOT EXISTS (SELECT 1 FROM public.usuarios existing WHERE lower(existing.usuario) = seed.usuario OR existing.dni = seed.dni);

UPDATE public.tiendas
SET jefe_id = (SELECT id FROM public.usuarios WHERE lower(usuario) = 'lider.roles' LIMIT 1),
    zonal_id = (SELECT id FROM public.usuarios WHERE lower(usuario) = 'zonal.roles' LIMIT 1)
WHERE lower(nombre) = 'tienda roles demo';

COMMIT;
