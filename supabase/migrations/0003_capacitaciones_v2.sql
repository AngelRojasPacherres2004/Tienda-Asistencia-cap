-- Reemplaza el modelo de capacitaciones (sesión con fecha) por catálogo de cursos + progreso por trabajador.
-- Ejecutar una sola vez en el SQL Editor del proyecto Supabase real.
BEGIN;

DROP TABLE IF EXISTS capacitacion_participantes;
DROP TABLE IF EXISTS capacitaciones;

CREATE TABLE cursos (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  competencia TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE encargados (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE capacitacion_progreso (
  id SERIAL PRIMARY KEY,
  curso_id INTEGER NOT NULL REFERENCES cursos (id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
  tienda_id INTEGER NOT NULL REFERENCES tiendas (id),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_curso', 'completado')),
  duracion_horas NUMERIC,
  encargado_id INTEGER REFERENCES encargados (id),
  fecha_finalizacion DATE,
  actualizado_por INTEGER REFERENCES usuarios (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (curso_id, usuario_id)
);
CREATE INDEX capacitacion_progreso_tienda_idx ON capacitacion_progreso (tienda_id, curso_id);

ALTER TABLE cursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE encargados ENABLE ROW LEVEL SECURITY;
ALTER TABLE capacitacion_progreso ENABLE ROW LEVEL SECURITY;

COMMIT;
