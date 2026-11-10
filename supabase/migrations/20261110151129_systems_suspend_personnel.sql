ALTER TABLE public.usuarios ADD COLUMN suspendido_sistemas boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.systems_suspend_personnel(p_actor_id integer, p_target_id integer, p_suspend boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE person public.usuarios%ROWTYPE;
BEGIN
  IF current_user NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'Solo Sistemas puede suspender personal.' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.usuarios WHERE id=p_actor_id AND rol='sistemas' AND estado='activo' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tu cuenta ya no tiene acceso de Sistemas.' USING ERRCODE='42501'; END IF;
  IF p_target_id=p_actor_id OR p_suspend IS NULL THEN RAISE EXCEPTION 'Acción no válida.'; END IF;
  SELECT * INTO person FROM public.usuarios WHERE id=p_target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La persona ya no existe.' USING ERRCODE='P0002'; END IF;
  IF person.rol NOT IN ('jefe_tienda','asistente_tienda','jefe_seguridad','jefe_area','seguridad','caja','almacenero','vendedor','asistente','trabajador') THEN
    RAISE EXCEPTION 'Solo se permite suspender personal de tienda.' USING ERRCODE='42501';
  END IF;
  IF p_suspend AND person.estado <> 'activo' AND NOT person.suspendido_sistemas THEN
    RAISE EXCEPTION 'El trabajador ya está inactivo; no se modificó su estado.';
  END IF;
  IF NOT p_suspend AND NOT person.suspendido_sistemas THEN
    RAISE EXCEPTION 'El trabajador no está suspendido por Sistemas.';
  END IF;
  UPDATE public.usuarios SET suspendido_sistemas=p_suspend,estado=CASE WHEN p_suspend THEN 'inactivo' ELSE 'activo' END
    WHERE id=p_target_id;
  RETURN jsonb_build_object('id',p_target_id,'suspendido_sistemas',p_suspend,'estado',CASE WHEN p_suspend THEN 'inactivo' ELSE 'activo' END);
END;
$$;
REVOKE ALL ON FUNCTION public.systems_suspend_personnel(integer,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.systems_suspend_personnel(integer,integer,boolean) TO service_role;
