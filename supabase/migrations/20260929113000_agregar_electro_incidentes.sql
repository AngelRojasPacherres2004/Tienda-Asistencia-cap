-- Añade Electro como ubicación válida y estandariza el rol de personas involucradas.
ALTER TABLE public.incidencias
  DROP CONSTRAINT IF EXISTS incidencias_area_check;

ALTER TABLE public.incidencias
  ADD CONSTRAINT incidencias_area_check CHECK (
    area IN (
      'piso_venta', 'textil', 'calzado', 'hogar', 'tecnologia', 'electro',
      'belleza', 'bano', 'caja', 'almacen', 'ingreso', 'exterior',
      'proveedores', 'otro'
    )
  );

UPDATE public.incidencia_personas
SET rol = 'Sospechoso'
WHERE lower(trim(rol)) IN ('ladrón', 'ladron');
