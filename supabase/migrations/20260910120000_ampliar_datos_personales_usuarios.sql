-- Datos personales, laborales y de contacto solicitados en el alta de usuarios.
ALTER TABLE public.usuarios
  ALTER COLUMN usuario TYPE TEXT,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
  ADD COLUMN IF NOT EXISTS sueldo NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS rol_personal TEXT NOT NULL DEFAULT 'otros',
  ADD COLUMN IF NOT EXISTS sexo TEXT NOT NULL DEFAULT 'no_especificado',
  ADD COLUMN IF NOT EXISTS telefono_emergencia VARCHAR(9),
  ADD COLUMN IF NOT EXISTS distrito TEXT,
  ADD COLUMN IF NOT EXISTS direccion TEXT,
  ADD COLUMN IF NOT EXISTS grado_academico TEXT NOT NULL DEFAULT 'sin_especificar',
  ADD COLUMN IF NOT EXISTS ciclo_semestre TEXT,
  ADD COLUMN IF NOT EXISTS puesto TEXT,
  ADD COLUMN IF NOT EXISTS estado_civil TEXT NOT NULL DEFAULT 'sin_especificar',
  ADD COLUMN IF NOT EXISTS numero_hijos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS talla_zapatillas VARCHAR(10),
  ADD COLUMN IF NOT EXISTS talla_polo TEXT NOT NULL DEFAULT 'sin_especificar',
  ADD COLUMN IF NOT EXISTS alergia TEXT,
  ADD COLUMN IF NOT EXISTS condicion_salud TEXT;

UPDATE public.usuarios
SET rol_personal = CASE rol
  WHEN 'admin' THEN 'administrador'
  WHEN 'jefe_tienda' THEN 'lider_equipo'
  WHEN 'empleado' THEN 'operante'
  ELSE COALESCE(rol_personal, 'otros')
END;

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_rol_personal_check,
  DROP CONSTRAINT IF EXISTS usuarios_sexo_check,
  DROP CONSTRAINT IF EXISTS usuarios_grado_academico_check,
  DROP CONSTRAINT IF EXISTS usuarios_estado_civil_check,
  DROP CONSTRAINT IF EXISTS usuarios_numero_hijos_check,
  DROP CONSTRAINT IF EXISTS usuarios_sueldo_check,
  DROP CONSTRAINT IF EXISTS usuarios_talla_polo_check,
  DROP CONSTRAINT IF EXISTS usuarios_telefono_emergencia_check,
  DROP CONSTRAINT IF EXISTS usuarios_fecha_nacimiento_check;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_rol_personal_check
    CHECK (rol_personal IN ('administrador', 'operante', 'lider_equipo', 'otros')),
  ADD CONSTRAINT usuarios_sexo_check
    CHECK (sexo IN ('hombre', 'mujer', 'no_especificado')),
  ADD CONSTRAINT usuarios_grado_academico_check
    CHECK (grado_academico IN ('sin_especificar', 'primaria', 'secundaria', 'tecnico', 'universitario', 'postgrado')),
  ADD CONSTRAINT usuarios_estado_civil_check
    CHECK (estado_civil IN ('sin_especificar', 'soltero', 'casado', 'conviviente', 'divorciado', 'viudo')),
  ADD CONSTRAINT usuarios_numero_hijos_check CHECK (numero_hijos >= 0),
  ADD CONSTRAINT usuarios_sueldo_check CHECK (sueldo IS NULL OR sueldo >= 0),
  ADD CONSTRAINT usuarios_talla_polo_check
    CHECK (talla_polo IN ('sin_especificar', 's', 'm', 'l', 'xl', 'xxl')),
  ADD CONSTRAINT usuarios_telefono_emergencia_check
    CHECK (telefono_emergencia IS NULL OR telefono_emergencia ~ '^[0-9]{9}$'),
  ADD CONSTRAINT usuarios_fecha_nacimiento_check
    CHECK (fecha_nacimiento IS NULL OR fecha_nacimiento <= CURRENT_DATE);
