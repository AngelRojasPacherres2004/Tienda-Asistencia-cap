BEGIN;

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_rol_check,
  DROP CONSTRAINT IF EXISTS usuarios_tienda_rol_check;

UPDATE public.usuarios
SET rol = 'gerente', rol_personal = 'administrador', tienda_id = NULL
WHERE rol = 'admin';

UPDATE public.usuarios
SET rol = 'empleado', rol_personal = 'operante'
WHERE rol = 'jefe_tienda';

UPDATE public.usuarios
SET usuario = 'gerente.roles',
    password = '$2b$12$Ri2njYbFxB21gklF4FUfmuE/ePGyXw.KpYB.1rciohWLp4.FZdog6',
    nombres = 'Gerente',
    apellidos = 'Comercial'
WHERE dni = '91000001'
  AND NOT EXISTS (
    SELECT 1 FROM public.usuarios otro
    WHERE lower(otro.usuario) = 'gerente.roles'
      AND otro.dni <> '91000001'
  );

UPDATE public.tiendas SET jefe_id = NULL;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_rol_check CHECK (
    rol IN ('gerente', 'jefe_zonal', 'administrador_tienda', 'empleado', 'vendedor', 'seguridad', 'coach')
  ),
  ADD CONSTRAINT usuarios_tienda_rol_check CHECK (
    (rol IN ('gerente', 'jefe_zonal', 'coach') AND tienda_id IS NULL) OR
    (rol IN ('administrador_tienda', 'empleado', 'vendedor', 'seguridad') AND tienda_id IS NOT NULL)
  );

COMMIT;
