-- Ocho rangos y módulos operativos por tienda.
BEGIN;

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_tienda_rol_check;
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

UPDATE usuarios SET rol = 'gerencia_general' WHERE rol = 'gerente';
UPDATE usuarios SET rol = 'gerencia_general' WHERE rol = 'admin';
UPDATE usuarios SET rol = 'jefe_tienda' WHERE rol = 'administrador_tienda';
UPDATE usuarios SET rol = 'asistente_tienda' WHERE rol = 'asistente';
UPDATE usuarios SET rol = 'trabajador' WHERE rol = 'vendedor';
UPDATE usuarios SET rol = 'trabajador' WHERE rol = 'empleado';

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (
  rol IN ('gerencia_general', 'gerente_comercial', 'coach', 'jefe_zonal',
          'jefe_tienda', 'asistente_tienda', 'seguridad', 'trabajador')
);
ALTER TABLE usuarios ADD CONSTRAINT usuarios_tienda_rol_check CHECK (
  (rol IN ('gerencia_general', 'gerente_comercial', 'coach', 'jefe_zonal') AND tienda_id IS NULL) OR
  (rol IN ('jefe_tienda', 'asistente_tienda', 'seguridad', 'trabajador') AND tienda_id IS NOT NULL)
);

CREATE TABLE trafico_tienda (
  id BIGSERIAL PRIMARY KEY,
  tienda_id INTEGER NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad >= 0),
  observaciones TEXT,
  registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tienda_id, fecha)
);

CREATE TABLE incidencias (
  id BIGSERIAL PRIMARY KEY,
  tienda_id INTEGER NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  asunto TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'otro' CHECK (tipo IN ('robo', 'robo_frustrado', 'accidente', 'dano', 'conflicto', 'otro')),
  area TEXT NOT NULL DEFAULT 'otro' CHECK (area IN ('piso_venta', 'textil', 'calzado', 'caja', 'almacen', 'ingreso', 'exterior', 'otro')),
  descripcion TEXT NOT NULL,
  gravedad TEXT NOT NULL DEFAULT 'media' CHECK (gravedad IN ('baja', 'media', 'alta', 'critica')),
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'en_revision', 'cerrada')),
  intervencion BOOLEAN NOT NULL DEFAULT false,
  detencion BOOLEAN NOT NULL DEFAULT false,
  registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
  notificacion_estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (notificacion_estado IN ('pendiente', 'enviada', 'error')),
  notificacion_detalle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE amonestaciones (
  id BIGSERIAL PRIMARY KEY,
  tienda_id INTEGER NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('verbal', 'carta_amonestacion', 'memorandum')),
  motivo TEXT NOT NULL,
  fecha DATE NOT NULL,
  registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE documentos_tienda (
  id BIGSERIAL PRIMARY KEY,
  tienda_id INTEGER NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  numero TEXT,
  entidad_emisora TEXT,
  fecha_emision DATE,
  fecha_vencimiento DATE NOT NULL,
  notas TEXT,
  registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE errores_personal (
  id BIGSERIAL PRIMARY KEY,
  tienda_id INTEGER NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  fecha DATE NOT NULL,
  categoria TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  accion_correctiva TEXT,
  registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX trafico_tienda_fecha_idx ON trafico_tienda(tienda_id, fecha DESC);
CREATE INDEX incidencias_tienda_fecha_idx ON incidencias(tienda_id, fecha DESC);
CREATE INDEX amonestaciones_usuario_fecha_idx ON amonestaciones(usuario_id, fecha DESC);
CREATE INDEX documentos_tienda_vencimiento_idx ON documentos_tienda(tienda_id, fecha_vencimiento);
CREATE INDEX errores_personal_usuario_fecha_idx ON errores_personal(usuario_id, fecha DESC);

ALTER TABLE trafico_tienda ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE amonestaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos_tienda ENABLE ROW LEVEL SECURITY;
ALTER TABLE errores_personal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE trafico_tienda, incidencias, amonestaciones, documentos_tienda, errores_personal FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE trafico_tienda, incidencias, amonestaciones, documentos_tienda, errores_personal TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

COMMIT;
