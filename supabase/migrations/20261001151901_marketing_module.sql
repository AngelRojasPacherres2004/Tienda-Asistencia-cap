BEGIN;

INSERT INTO public.roles (codigo, nombre, nivel, ambito_tienda, orden)
VALUES ('marketing', 'Marketing', 90, false, 25)
ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, nivel = EXCLUDED.nivel, activo = true;

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_tienda_rol_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_tienda_rol_check CHECK (
  (rol IN ('gerencia_general', 'gerente_comercial', 'marketing', 'coach', 'jefe_zonal') AND tienda_id IS NULL) OR
  (rol IN ('jefe_tienda', 'asistente_tienda', 'jefe_seguridad', 'jefe_area', 'seguridad', 'caja', 'almacenero', 'vendedor', 'asistente', 'trabajador') AND tienda_id IS NOT NULL)
);

ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS acceso_todas_tiendas BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.marketing_tiendas (
  usuario_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tienda_id INTEGER NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, tienda_id)
);

CREATE TABLE IF NOT EXISTS public.campanas_marketing (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  trabajadores_ids INTEGER[] NOT NULL DEFAULT '{}',
  tiendas_ids INTEGER[] NOT NULL DEFAULT '{}',
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  rubros TEXT NOT NULL,
  presupuesto_previsto NUMERIC(14,2) NOT NULL CHECK (presupuesto_previsto >= 0),
  presupuesto_real NUMERIC(14,2) CHECK (presupuesto_real >= 0),
  estado_validacion TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_validacion IN ('pendiente','aprobada','observada','rechazada')),
  validacion_descripcion TEXT,
  creado_por INTEGER NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fecha_fin >= fecha_inicio)
);

CREATE TABLE IF NOT EXISTS public.incidencias_marketing (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('desembolso_presupuestal','incumplimiento_proveedores','incumplimiento_jefes_area','incumplimiento_caja','campana','informacion_dudosa','incumplimiento_tienda')),
  tienda_id INTEGER REFERENCES public.tiendas(id) ON DELETE SET NULL,
  campana_id BIGINT REFERENCES public.campanas_marketing(id) ON DELETE SET NULL,
  descripcion TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','en_proceso','cerrada')),
  registrado_por INTEGER NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.entregables_marketing (
  id BIGSERIAL PRIMARY KEY,
  campana_id BIGINT REFERENCES public.campanas_marketing(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  responsable TEXT,
  fecha_entrega DATE,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_proceso','entregado','observado')),
  registrado_por INTEGER NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seguidores_redes (
  id BIGSERIAL PRIMARY KEY,
  red TEXT NOT NULL,
  fecha DATE NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad >= 0),
  observaciones TEXT,
  registrado_por INTEGER NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (red, fecha)
);

CREATE INDEX IF NOT EXISTS campanas_marketing_fechas_idx ON public.campanas_marketing(fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS incidencias_marketing_tienda_idx ON public.incidencias_marketing(tienda_id, created_at DESC);
CREATE INDEX IF NOT EXISTS entregables_marketing_campana_idx ON public.entregables_marketing(campana_id);
CREATE INDEX IF NOT EXISTS seguidores_redes_fecha_idx ON public.seguidores_redes(fecha DESC);

ALTER TABLE public.marketing_tiendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanas_marketing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidencias_marketing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entregables_marketing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguidores_redes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketing_tiendas, public.campanas_marketing, public.incidencias_marketing, public.entregables_marketing, public.seguidores_redes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marketing_tiendas, public.campanas_marketing, public.incidencias_marketing, public.entregables_marketing, public.seguidores_redes TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

UPDATE public.usuarios
SET rol = 'marketing', password = '$2b$12$2qzxHJYiF3ZO5X6/NSo/VOMQR1TiCm18nfE/Mwdi05E89IOegU4Ri', estado = 'activo', tienda_id = NULL, acceso_todas_tiendas = true
WHERE lower(usuario) = 'marketing';

INSERT INTO public.usuarios (nombres, apellidos, dni, usuario, password, rol, tienda_id, estado, fecha_ingreso, acceso_todas_tiendas)
SELECT 'Equipo', 'Marketing', '99999998', 'marketing', '$2b$12$2qzxHJYiF3ZO5X6/NSo/VOMQR1TiCm18nfE/Mwdi05E89IOegU4Ri', 'marketing', NULL, 'activo', CURRENT_DATE, true
WHERE NOT EXISTS (SELECT 1 FROM public.usuarios WHERE lower(usuario) = 'marketing');

COMMIT;
