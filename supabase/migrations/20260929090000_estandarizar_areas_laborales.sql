WITH areas_normalizadas AS (
  SELECT
    id,
    CASE upper(trim(area_laboral))
      WHEN 'ADMINISTRACION' THEN 'Administración'
      WHEN 'ADMINISTRACIÓN' THEN 'Administración'
      WHEN 'ADMINISTRATIVA' THEN 'Administración'
      WHEN 'ALMACEN' THEN 'Almacén'
      WHEN 'ALMACÉN' THEN 'Almacén'
      WHEN 'CAJA' THEN 'Caja'
      WHEN 'CALZADO' THEN 'Calzado'
      WHEN 'CALZADO / TEXTIL' THEN 'Calzado / Textil'
      WHEN 'ELECTRO' THEN 'Electro'
      WHEN 'ELECTRO MENOR' THEN 'Electro menor'
      WHEN 'HOGAR' THEN 'Hogar'
      WHEN 'HOGAR / ELECTRO' THEN 'Hogar / Electro'
      WHEN 'HOGAR / TECNOLOGIA' THEN 'Hogar / Tecnología'
      WHEN 'HOGAR / TECNOLOGÍA' THEN 'Hogar / Tecnología'
      WHEN 'HOGAR Y MENAJE' THEN 'Hogar y Menaje'
      WHEN 'SEGURIDAD' THEN 'Seguridad'
      WHEN 'TECNOLOGIA' THEN 'Tecnología'
      WHEN 'TECNOLOGÍA' THEN 'Tecnología'
      WHEN 'TEXTIL' THEN 'Textil'
      WHEN 'VENTAS' THEN 'Ventas'
      ELSE trim(area_laboral)
    END AS area
  FROM public.usuarios
  WHERE area_laboral IS NOT NULL AND trim(area_laboral) <> ''
)
UPDATE public.usuarios AS usuario
SET area_laboral = areas_normalizadas.area
FROM areas_normalizadas
WHERE usuario.id = areas_normalizadas.id
  AND usuario.area_laboral IS DISTINCT FROM areas_normalizadas.area;

WITH areas_normalizadas AS (
  SELECT
    id,
    CASE upper(trim(area))
      WHEN 'ADMINISTRACION' THEN 'Administración'
      WHEN 'ADMINISTRACIÓN' THEN 'Administración'
      WHEN 'ADMINISTRATIVA' THEN 'Administración'
      WHEN 'ALMACEN' THEN 'Almacén'
      WHEN 'ALMACÉN' THEN 'Almacén'
      WHEN 'CAJA' THEN 'Caja'
      WHEN 'CALZADO' THEN 'Calzado'
      WHEN 'CALZADO / TEXTIL' THEN 'Calzado / Textil'
      WHEN 'ELECTRO' THEN 'Electro'
      WHEN 'ELECTRO MENOR' THEN 'Electro menor'
      WHEN 'HOGAR' THEN 'Hogar'
      WHEN 'HOGAR / ELECTRO' THEN 'Hogar / Electro'
      WHEN 'HOGAR / TECNOLOGIA' THEN 'Hogar / Tecnología'
      WHEN 'HOGAR / TECNOLOGÍA' THEN 'Hogar / Tecnología'
      WHEN 'HOGAR Y MENAJE' THEN 'Hogar y Menaje'
      WHEN 'SEGURIDAD' THEN 'Seguridad'
      WHEN 'TECNOLOGIA' THEN 'Tecnología'
      WHEN 'TECNOLOGÍA' THEN 'Tecnología'
      WHEN 'TEXTIL' THEN 'Textil'
      WHEN 'VENTAS' THEN 'Ventas'
      ELSE trim(area)
    END AS area
  FROM public.cobertura_trabajadores
  WHERE area IS NOT NULL AND trim(area) <> ''
)
UPDATE public.cobertura_trabajadores AS cobertura
SET area = areas_normalizadas.area
FROM areas_normalizadas
WHERE cobertura.id = areas_normalizadas.id
  AND cobertura.area IS DISTINCT FROM areas_normalizadas.area;
