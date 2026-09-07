-- Esquema inicial: Asiste (asistencias y capacitaciones multi-tienda)
-- Ejecutar una sola vez en el SQL Editor del proyecto Supabase real.
BEGIN;

CREATE TABLE tiendas (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  direccion TEXT,
  jefe_id INTEGER,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tiendas_nombre_lower_ux ON tiendas (LOWER(nombre));

CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  dni VARCHAR(8) NOT NULL,
  usuario VARCHAR(40) NOT NULL,
  password TEXT NOT NULL,
  telefono VARCHAR(9),
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'jefe_tienda', 'empleado')),
  tienda_id INTEGER REFERENCES tiendas (id),
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT usuarios_tienda_rol_check CHECK (
    (rol = 'admin' AND tienda_id IS NULL) OR
    (rol IN ('jefe_tienda', 'empleado') AND tienda_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX usuarios_usuario_lower_ux ON usuarios (LOWER(usuario));
CREATE UNIQUE INDEX usuarios_dni_ux ON usuarios (dni);

ALTER TABLE tiendas
  ADD CONSTRAINT tiendas_jefe_fk FOREIGN KEY (jefe_id) REFERENCES usuarios (id);

CREATE TABLE asistencias (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
  tienda_id INTEGER NOT NULL REFERENCES tiendas (id),
  fecha DATE NOT NULL,
  estado TEXT NOT NULL DEFAULT 'presente'
    CHECK (estado IN ('presente', 'tardanza', 'falta', 'justificado', 'descanso')),
  hora_entrada TIME,
  hora_salida TIME,
  observaciones TEXT,
  registrado_por INTEGER REFERENCES usuarios (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, fecha)
);
CREATE INDEX asistencias_tienda_fecha_idx ON asistencias (tienda_id, fecha);

CREATE TABLE capacitaciones (
  id SERIAL PRIMARY KEY,
  tienda_id INTEGER REFERENCES tiendas (id),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  fecha DATE NOT NULL,
  duracion_horas NUMERIC,
  instructor TEXT,
  estado TEXT NOT NULL DEFAULT 'programada'
    CHECK (estado IN ('programada', 'realizada', 'cancelada')),
  creado_por INTEGER REFERENCES usuarios (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX capacitaciones_tienda_fecha_idx ON capacitaciones (tienda_id, fecha);

CREATE TABLE capacitacion_participantes (
  id SERIAL PRIMARY KEY,
  capacitacion_id INTEGER NOT NULL REFERENCES capacitaciones (id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
  asistio BOOLEAN NOT NULL DEFAULT false,
  observaciones TEXT,
  UNIQUE (capacitacion_id, usuario_id)
);

-- RLS: solo se accede vía la Netlify Function con la service role key,
-- así que se deja todo cerrado por defecto para el resto de roles.
ALTER TABLE tiendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE capacitaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE capacitacion_participantes ENABLE ROW LEVEL SECURITY;

-- Usuario administrador inicial.
-- Usuario: admin  |  Contraseña: Admin123!  (cámbiala apenas ingreses)
-- Hash bcrypt (costo 12) de "Admin123!":
INSERT INTO usuarios (nombres, apellidos, dni, usuario, password, telefono, rol, tienda_id, estado)
VALUES (
  'Administrador', 'General', '00000000', 'admin',
  '$2b$12$55VLjc2GgrbreHffgJDmq.WNQd4P/Tjv3Du.lffnWrlDw9iBkbc/m',
  NULL, 'admin', NULL, 'activo'
);

COMMIT;
