BEGIN;

ALTER TABLE public.incidencias
  DROP CONSTRAINT IF EXISTS incidencias_tipo_check,
  DROP CONSTRAINT IF EXISTS incidencias_area_check;

ALTER TABLE public.incidencias
  ADD CONSTRAINT incidencias_tipo_check CHECK (
    tipo IN (
      'robo', 'robo_frustrado', 'robo_interno', 'estafa', 'asalto',
      'fiscalizacion', 'cambio_precio', 'accidente', 'dano_infraestructura',
      'problema_operativo', 'falla_interna', 'otro'
    )
  ),
  ADD CONSTRAINT incidencias_area_check CHECK (
    area IN (
      'piso_venta', 'textil', 'calzado', 'hogar', 'tecnologia', 'belleza',
      'bano', 'caja', 'almacen', 'ingreso', 'exterior', 'proveedores', 'otro'
    )
  );

COMMIT;
