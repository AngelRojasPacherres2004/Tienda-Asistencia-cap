-- Only the server's service_role may call this transaction after checking Sistemas.
CREATE TABLE public.systems_personnel_deletions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  deleted_user_id integer NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.systems_personnel_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.systems_personnel_deletions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.systems_personnel_deletions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.systems_personnel_deletions_id_seq TO service_role;

CREATE FUNCTION public.systems_delete_personnel(p_actor_id integer, p_target_id integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_role text;
  ref record;
  affected bigint;
  changes jsonb := '[]'::jsonb;
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Solo Sistemas puede eliminar personal.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.usuarios WHERE id = p_actor_id AND rol = 'sistemas' AND estado = 'activo' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tu cuenta ya no tiene acceso de Sistemas.' USING ERRCODE = '42501'; END IF;
  IF p_actor_id = p_target_id THEN RAISE EXCEPTION 'No puedes eliminarte a ti mismo.'; END IF;
  SELECT rol INTO target_role FROM public.usuarios WHERE id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La persona ya no existe.' USING ERRCODE = 'P0002'; END IF;
  IF target_role NOT IN ('jefe_tienda','asistente_tienda','jefe_seguridad','jefe_area','seguridad','caja','almacenero','vendedor','asistente','trabajador') THEN
    RAISE EXCEPTION 'Solo se permite eliminar personal de tienda.' USING ERRCODE = '42501';
  END IF;

  -- Remove attendance before its coverage assignments, including historical rows
  -- that only reference the assignment rather than usuario_id.
  DELETE FROM public.log_asistencias WHERE usuario_id = p_target_id OR cobertura_trabajador_id IN
    (SELECT id FROM public.cobertura_trabajadores WHERE usuario_id = p_target_id);
  GET DIAGNOSTICS affected = ROW_COUNT;
  changes := changes || jsonb_build_array(jsonb_build_object('table','log_asistencias','deleted',affected));
  DELETE FROM public.asistencias WHERE usuario_id = p_target_id OR cobertura_trabajador_id IN
    (SELECT id FROM public.cobertura_trabajadores WHERE usuario_id = p_target_id);
  GET DIAGNOSTICS affected = ROW_COUNT;
  changes := changes || jsonb_build_array(jsonb_build_object('table','asistencias','deleted',affected));

  -- Delete personal records, scopes, assignments and private messages. Shared
  -- store records authored by the person are preserved in the following pass.
  FOR ref IN
    SELECT DISTINCT c.conrelid, a.attname
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
    WHERE c.contype='f' AND c.confrelid='public.usuarios'::regclass
      AND cardinality(c.conkey)=1 AND a.attname IN ('usuario_id','remitente_id','destinatario_id')
    ORDER BY c.conrelid, a.attname
  LOOP
    EXECUTE format('DELETE FROM %s WHERE %I = $1', ref.conrelid::regclass, ref.attname) USING p_target_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    changes := changes || jsonb_build_array(jsonb_build_object('table',ref.conrelid::regclass::text,'column',ref.attname,'deleted',affected));
  END LOOP;

  FOR ref IN
    SELECT DISTINCT c.conrelid, a.attname, a.attnotnull
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
    WHERE c.contype='f' AND c.confrelid='public.usuarios'::regclass AND cardinality(c.conkey)=1
    ORDER BY c.conrelid, a.attname
  LOOP
    IF ref.attname NOT IN ('creado_por','registrado_por','actualizado_por','validado_por','subido_por','reportado_por','realizado_por','jefe_id','jefe_zonal_id','zonal_id','zonal_creador_id','actor_id','usuario_id','remitente_id','destinatario_id') THEN
      RAISE EXCEPTION 'Relación no reconocida: %.%. No se eliminó ningún dato.', ref.conrelid::regclass, ref.attname;
    END IF;
    EXECUTE format('UPDATE %s SET %I = $2 WHERE %I = $1', ref.conrelid::regclass, ref.attname, ref.attname)
      USING p_target_id, CASE WHEN ref.attnotnull THEN p_actor_id ELSE NULL END;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected > 0 THEN
      changes := changes || jsonb_build_array(jsonb_build_object('table',ref.conrelid::regclass::text,'column',ref.attname,'preserved',affected,'reassigned_to',CASE WHEN ref.attnotnull THEN p_actor_id ELSE NULL END));
    END IF;
  END LOOP;

  -- The existing history protection trigger stays enabled for all other paths.
  DELETE FROM public.usuarios WHERE id = p_target_id;
  INSERT INTO public.systems_personnel_deletions(actor_id,deleted_user_id,details) VALUES(p_actor_id,p_target_id,changes);
  RETURN jsonb_build_object('deleted',true,'id',p_target_id);
END;
$$;
REVOKE ALL ON FUNCTION public.systems_delete_personnel(integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.systems_delete_personnel(integer,integer) TO service_role;
