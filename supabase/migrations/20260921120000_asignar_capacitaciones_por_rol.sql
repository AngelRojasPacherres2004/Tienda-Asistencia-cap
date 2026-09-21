BEGIN;

CREATE TABLE public.curso_roles (
  curso_id INTEGER NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  rol_codigo TEXT NOT NULL REFERENCES public.roles(codigo),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (curso_id, rol_codigo)
);

CREATE INDEX curso_roles_rol_idx ON public.curso_roles(rol_codigo, curso_id);

INSERT INTO public.curso_roles (curso_id, rol_codigo)
SELECT c.id, r.codigo
FROM public.cursos c
CROSS JOIN public.roles r
WHERE r.codigo IN (
  'gerencia_general', 'gerente_comercial', 'jefe_zonal', 'jefe_tienda', 'asistente_tienda',
  'jefe_seguridad', 'jefe_area', 'seguridad', 'caja', 'almacenero',
  'vendedor', 'asistente', 'trabajador'
)
ON CONFLICT DO NOTHING;

ALTER TABLE public.curso_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.curso_roles FROM anon, authenticated;
GRANT ALL ON public.curso_roles TO service_role;

COMMIT;
