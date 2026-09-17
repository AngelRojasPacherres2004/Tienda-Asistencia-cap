BEGIN;

ALTER TABLE incidencias
  DROP CONSTRAINT IF EXISTS incidencias_area_check;

ALTER TABLE incidencias
  ADD CONSTRAINT incidencias_area_check
  CHECK (area IN ('piso_venta', 'textil', 'calzado', 'caja', 'almacen', 'ingreso', 'exterior', 'otro'));

COMMIT;
