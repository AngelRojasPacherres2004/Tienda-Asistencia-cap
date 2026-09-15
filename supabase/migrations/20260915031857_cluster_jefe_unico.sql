-- Cada tienda pertenece a un solo jefe zonal (cluster) y tiene un solo jefe de tienda.
CREATE UNIQUE INDEX IF NOT EXISTS tienda_jefes_zonales_tienda_unica_idx
  ON public.tienda_jefes_zonales (tienda_id);

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_jefe_tienda_unico_idx
  ON public.usuarios (tienda_id)
  WHERE rol = 'jefe_tienda';

CREATE UNIQUE INDEX IF NOT EXISTS tiendas_jefe_unico_idx
  ON public.tiendas (jefe_id)
  WHERE jefe_id IS NOT NULL;
