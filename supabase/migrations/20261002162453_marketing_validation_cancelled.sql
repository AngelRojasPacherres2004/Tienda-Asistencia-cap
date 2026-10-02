-- Keep historical states readable while allowing cancellations for new validations.
ALTER TABLE public.validaciones_marketing DROP CONSTRAINT validaciones_marketing_estado_check;
ALTER TABLE public.validaciones_marketing ADD CONSTRAINT validaciones_marketing_estado_check
  CHECK (estado IN ('pendiente', 'aprobada', 'cancelada', 'observada', 'rechazada'));
