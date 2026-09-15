BEGIN;

CREATE TABLE public.clusters (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  codigo TEXT NOT NULL UNIQUE,
  jefe_zonal_id INTEGER UNIQUE REFERENCES public.usuarios(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tiendas ADD COLUMN cluster_id BIGINT REFERENCES public.clusters(id) ON DELETE RESTRICT;
CREATE INDEX tiendas_cluster_id_idx ON public.tiendas(cluster_id);

-- Conserva las asignaciones del modelo anterior creando un clúster por zonal.
INSERT INTO public.clusters (nombre, codigo, jefe_zonal_id)
SELECT 'Clúster ' || u.nombres || ' ' || u.apellidos, 'CL-' || u.id, u.id
FROM public.usuarios u
WHERE u.rol = 'jefe_zonal'
  AND EXISTS (SELECT 1 FROM public.tienda_jefes_zonales a WHERE a.jefe_zonal_id = u.id)
ON CONFLICT DO NOTHING;

UPDATE public.tiendas t
SET cluster_id = c.id
FROM public.tienda_jefes_zonales a
JOIN public.clusters c ON c.jefe_zonal_id = a.jefe_zonal_id
WHERE a.tienda_id = t.id AND t.cluster_id IS NULL;

ALTER TABLE public.clusters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clusters FROM anon, authenticated;
GRANT ALL ON TABLE public.clusters TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.clusters_id_seq TO service_role;

COMMIT;
