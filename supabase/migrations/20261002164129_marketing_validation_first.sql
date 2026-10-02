ALTER TABLE public.validaciones_marketing ALTER COLUMN campana_id DROP NOT NULL;
ALTER TABLE public.validaciones_marketing ADD COLUMN nombre TEXT;
UPDATE public.validaciones_marketing v SET nombre = c.nombre FROM public.campanas_marketing c WHERE c.id = v.campana_id;
ALTER TABLE public.campanas_marketing ADD COLUMN validacion_id BIGINT UNIQUE REFERENCES public.validaciones_marketing(id);

CREATE FUNCTION public.check_marketing_campaign_validation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE validation public.validaciones_marketing%ROWTYPE;
BEGIN
  IF NEW.validacion_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO validation FROM public.validaciones_marketing WHERE id = NEW.validacion_id FOR UPDATE;
  IF NOT FOUND OR validation.registrado_por <> NEW.creado_por THEN
    RAISE EXCEPTION 'La validación no pertenece a este equipo de Marketing.';
  END IF;
  IF validation.estado <> 'aprobada' OR validation.campana_id IS NOT NULL THEN
    RAISE EXCEPTION 'Selecciona una validación aprobada pendiente de registro.';
  END IF;
  NEW.nombre := validation.nombre;
  NEW.presupuesto_previsto := validation.presupuesto;
  NEW.estado_validacion := 'aprobada';
  NEW.registro_completado := true;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_marketing_campaign_validation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_marketing_campaign_validation() TO service_role;
CREATE TRIGGER check_marketing_campaign_validation BEFORE INSERT ON public.campanas_marketing
FOR EACH ROW EXECUTE FUNCTION public.check_marketing_campaign_validation();

CREATE FUNCTION public.link_marketing_campaign_validation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.validacion_id IS NOT NULL THEN
    UPDATE public.validaciones_marketing SET campana_id = NEW.id WHERE id = NEW.validacion_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.link_marketing_campaign_validation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_marketing_campaign_validation() TO service_role;
CREATE TRIGGER link_marketing_campaign_validation AFTER INSERT ON public.campanas_marketing
FOR EACH ROW EXECUTE FUNCTION public.link_marketing_campaign_validation();
