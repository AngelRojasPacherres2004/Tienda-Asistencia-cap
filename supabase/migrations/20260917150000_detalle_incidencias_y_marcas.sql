BEGIN;

CREATE TABLE marcas (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marcas_nombre_no_vacio CHECK (btrim(nombre) <> '')
);

CREATE UNIQUE INDEX marcas_nombre_unico_idx ON marcas (lower(btrim(nombre)));

CREATE TABLE incidencia_productos (
  id BIGSERIAL PRIMARY KEY,
  incidencia_id BIGINT NOT NULL REFERENCES incidencias(id) ON DELETE CASCADE,
  marca_id BIGINT NOT NULL REFERENCES marcas(id),
  producto TEXT NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  valor NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  recuperado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT incidencia_productos_producto_no_vacio CHECK (btrim(producto) <> '')
);

CREATE TABLE incidencia_personas (
  id BIGSERIAL PRIMARY KEY,
  incidencia_id BIGINT NOT NULL REFERENCES incidencias(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL,
  documento TEXT,
  observacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT incidencia_personas_nombre_no_vacio CHECK (btrim(nombre) <> ''),
  CONSTRAINT incidencia_personas_rol_no_vacio CHECK (btrim(rol) <> '')
);

CREATE INDEX incidencia_productos_incidencia_idx ON incidencia_productos(incidencia_id);
CREATE INDEX incidencia_productos_marca_idx ON incidencia_productos(marca_id);
CREATE INDEX incidencia_personas_incidencia_idx ON incidencia_personas(incidencia_id);

ALTER TABLE marcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidencia_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidencia_personas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE marcas, incidencia_productos, incidencia_personas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE marcas, incidencia_productos, incidencia_personas TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

COMMIT;
