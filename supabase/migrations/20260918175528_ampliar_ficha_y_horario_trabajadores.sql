BEGIN;

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS tipo_documento TEXT NOT NULL DEFAULT 'dni',
  ADD COLUMN IF NOT EXISTS regimen_jornada TEXT,
  ADD COLUMN IF NOT EXISTS tipo_turno TEXT,
  ADD COLUMN IF NOT EXISTS tiene_parentesco BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tipo_parentesco TEXT,
  ADD COLUMN IF NOT EXISTS familiar_vinculo TEXT;

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_tipo_documento_check,
  DROP CONSTRAINT IF EXISTS usuarios_documento_formato_check,
  DROP CONSTRAINT IF EXISTS usuarios_regimen_jornada_check,
  DROP CONSTRAINT IF EXISTS usuarios_tipo_turno_check,
  DROP CONSTRAINT IF EXISTS usuarios_parentesco_detalle_check;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_tipo_documento_check
    CHECK (tipo_documento IN ('dni', 'ce')),
  ADD CONSTRAINT usuarios_documento_formato_check
    CHECK (
      (tipo_documento = 'dni' AND dni ~ '^[0-9]{8}$') OR
      (tipo_documento = 'ce' AND dni ~ '^[0-9]{9}$')
    ),
  ADD CONSTRAINT usuarios_regimen_jornada_check
    CHECK (regimen_jornada IS NULL OR regimen_jornada IN ('4h', '8h', '12h')),
  ADD CONSTRAINT usuarios_tipo_turno_check
    CHECK (tipo_turno IS NULL OR tipo_turno IN ('apertura', 'intermedio', 'cierre', 'part_time')),
  ADD CONSTRAINT usuarios_parentesco_detalle_check
    CHECK (
      tiene_parentesco = false OR
      (btrim(coalesce(tipo_parentesco, '')) <> '' AND btrim(coalesce(familiar_vinculo, '')) <> '')
    );

CREATE TABLE public.horarios_trabajadores (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  trabaja BOOLEAN NOT NULL DEFAULT false,
  hora_entrada TIME,
  hora_salida TIME,
  observacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT horarios_trabajadores_usuario_dia_ux UNIQUE (usuario_id, dia_semana),
  CONSTRAINT horarios_trabajadores_horas_check CHECK (
    (trabaja = false AND hora_entrada IS NULL AND hora_salida IS NULL) OR
    (trabaja = true AND hora_entrada IS NOT NULL AND hora_salida IS NOT NULL)
  )
);

ALTER TABLE public.horarios_trabajadores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.horarios_trabajadores FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.horarios_trabajadores TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.horarios_trabajadores_id_seq TO service_role;

COMMENT ON COLUMN public.usuarios.grado_academico IS 'Nivel de estudio del trabajador.';
COMMENT ON TABLE public.horarios_trabajadores IS 'Horario semanal vigente de cada trabajador, de lunes (1) a domingo (7).';

COMMIT;
