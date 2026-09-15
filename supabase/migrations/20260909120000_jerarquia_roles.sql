-- Nueva jerarquía organizacional y asignación de varias tiendas a jefes zonales.
BEGIN;

ALTER TABLE tiendas DROP CONSTRAINT IF EXISTS tiendas_jefe_fk;
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_tienda_rol_check;

UPDATE usuarios SET rol = 'gerente' WHERE rol = 'admin';
UPDATE usuarios SET rol = 'administrador_tienda' WHERE rol = 'jefe_tienda';
UPDATE usuarios SET rol = 'vendedor' WHERE rol = 'empleado';

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (
  rol IN ('gerente', 'jefe_zonal', 'administrador_tienda', 'asistente', 'vendedor', 'seguridad')
);
ALTER TABLE usuarios ADD CONSTRAINT usuarios_tienda_rol_check CHECK (
  (rol IN ('gerente', 'jefe_zonal') AND tienda_id IS NULL) OR
  (rol IN ('administrador_tienda', 'asistente', 'vendedor', 'seguridad') AND tienda_id IS NOT NULL)
);

-- jefe_id se conserva para no perder datos, pero ahora representa al administrador de tienda.
ALTER TABLE tiendas ADD CONSTRAINT tiendas_jefe_fk
  FOREIGN KEY (jefe_id) REFERENCES usuarios (id) ON DELETE SET NULL;

CREATE TABLE tienda_jefes_zonales (
  jefe_zonal_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  tienda_id INTEGER NOT NULL REFERENCES tiendas (id) ON DELETE CASCADE,
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (jefe_zonal_id, tienda_id)
);
CREATE INDEX tienda_jefes_zonales_tienda_idx ON tienda_jefes_zonales (tienda_id);
ALTER TABLE tienda_jefes_zonales ENABLE ROW LEVEL SECURITY;

-- El backend usa exclusivamente la service role; el acceso directo queda cerrado.
REVOKE ALL ON TABLE tienda_jefes_zonales FROM anon, authenticated;

COMMIT;
