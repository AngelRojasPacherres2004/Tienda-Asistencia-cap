BEGIN;

ALTER TABLE usuarios
  ALTER COLUMN usuario DROP NOT NULL,
  ALTER COLUMN password DROP NOT NULL;

CREATE TABLE periodos_laborales (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha_ingreso DATE NOT NULL,
  fecha_salida DATE,
  motivo_salida TEXT,
  registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT periodos_laborales_fechas_check CHECK (fecha_salida IS NULL OR fecha_salida >= fecha_ingreso),
  CONSTRAINT periodos_laborales_motivo_check CHECK (fecha_salida IS NULL OR btrim(coalesce(motivo_salida, '')) <> '')
);

INSERT INTO periodos_laborales (usuario_id, fecha_ingreso, fecha_salida, motivo_salida)
SELECT id, fecha_ingreso, fecha_salida,
  CASE WHEN fecha_salida IS NOT NULL THEN coalesce(nullif(btrim(motivo_salida), ''), 'Motivo no registrado') ELSE NULL END
FROM usuarios;

CREATE INDEX periodos_laborales_usuario_fecha_idx
  ON periodos_laborales(usuario_id, fecha_ingreso DESC);
CREATE UNIQUE INDEX periodos_laborales_activo_ux
  ON periodos_laborales(usuario_id) WHERE fecha_salida IS NULL;

ALTER TABLE periodos_laborales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE periodos_laborales FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE periodos_laborales TO service_role;
GRANT USAGE, SELECT ON SEQUENCE periodos_laborales_id_seq TO service_role;

COMMIT;
