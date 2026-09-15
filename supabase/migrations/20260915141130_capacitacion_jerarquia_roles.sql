-- Los roles centrales (por ejemplo, jefe zonal) no tienen una tienda directa,
-- pero también reciben y registran progreso de capacitaciones.
ALTER TABLE public.capacitacion_progreso
  ALTER COLUMN tienda_id DROP NOT NULL;
