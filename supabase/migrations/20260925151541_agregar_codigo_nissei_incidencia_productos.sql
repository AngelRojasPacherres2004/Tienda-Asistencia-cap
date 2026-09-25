ALTER TABLE public.incidencia_productos
  ADD COLUMN IF NOT EXISTS codigo_nissei TEXT;

COMMENT ON COLUMN public.incidencia_productos.codigo_nissei IS
  'Copia informativa del código Nissei al registrar la incidencia; no modifica el inventario.';
