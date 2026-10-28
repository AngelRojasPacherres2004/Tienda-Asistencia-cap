BEGIN;

ALTER TABLE public.cobertura_trabajadores
  ALTER COLUMN usuario_id DROP NOT NULL,
  ALTER COLUMN tienda_origen_id DROP NOT NULL,
  ADD COLUMN nombre_manual text,
  ADD COLUMN dni_manual text,
  ADD COLUMN origen_manual text,
  ADD CONSTRAINT cobertura_identidad_check CHECK (
    (usuario_id IS NOT NULL AND tienda_origen_id IS NOT NULL AND nombre_manual IS NULL AND dni_manual IS NULL AND origen_manual IS NULL)
    OR
    (usuario_id IS NULL AND tienda_origen_id IS NULL
      AND nombre_manual IS NOT NULL AND length(btrim(nombre_manual)) BETWEEN 1 AND 200
      AND origen_manual IS NOT NULL AND length(btrim(origen_manual)) BETWEEN 1 AND 200
      AND (dni_manual IS NULL OR dni_manual ~ '^[0-9]{8}$'))
  );

COMMENT ON COLUMN public.cobertura_trabajadores.nombre_manual IS
  'Nombre de una persona no registrada en usuarios; solo se usa para esta cobertura.';

COMMIT;
