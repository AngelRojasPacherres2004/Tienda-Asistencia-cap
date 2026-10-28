BEGIN;
ALTER TABLE public.cobertura_trabajadores ADD COLUMN horas numeric(4,2)
  CONSTRAINT cobertura_horas_check CHECK (horas > 0 AND horas <= 24);
COMMENT ON COLUMN public.cobertura_trabajadores.horas IS 'Cantidad de horas de apoyo del dia. NULL en registros anteriores.';

CREATE OR REPLACE FUNCTION public.registrar_cobertura_diaria(p_tienda_id integer, p_creado_por integer, p_trabajadores jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_fecha date := (now() AT TIME ZONE 'America/Lima')::date;
  v_cobertura public.coberturas_especiales;
  v_detalle public.cobertura_trabajadores;
  v_item jsonb;
  v_usuario public.usuarios;
  v_estado text;
  v_horas numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id=p_creado_por AND estado='activo' AND rol IN ('jefe_tienda','asistente_tienda'))
    OR NOT EXISTS (SELECT 1 FROM public.tiendas WHERE id=p_tienda_id AND estado='activo') THEN
    RAISE EXCEPTION 'Administrador o tienda no válidos' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_trabajadores) <> 'array' OR jsonb_array_length(p_trabajadores) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Agrega entre 1 y 100 trabajadores' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.coberturas_especiales(tienda_destino_id,fecha_inicio,fecha_fin,tipo_dia,motivo,estado,creado_por)
    VALUES(p_tienda_id,v_fecha,v_fecha,'especial','Apoyo de personal del día','confirmada',p_creado_por) RETURNING * INTO v_cobertura;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_trabajadores) LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_fecha::text || ':' ||
      coalesce(NULLIF(v_item->>'usuario_id',''),NULLIF(v_item->>'dni_manual',''),p_tienda_id::text || ':' || lower(btrim(v_item->>'nombre_manual'))),0));
    IF coalesce(v_item->>'horas','') !~ '^[0-9]+([.][0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Indica horas de apoyo validas (maximo dos decimales)' USING ERRCODE='22023';
    END IF;
    v_horas := (v_item->>'horas')::numeric;
    IF v_horas <= 0 OR v_horas > 24 THEN
      RAISE EXCEPTION 'Las horas de apoyo deben ser mayores que 0 y hasta 24' USING ERRCODE='22023';
    END IF;
    v_usuario := NULL;
    IF NULLIF(v_item->>'usuario_id','') IS NOT NULL THEN
      SELECT * INTO v_usuario FROM public.usuarios WHERE id=(v_item->>'usuario_id')::integer AND estado='activo'
        AND rol IN ('jefe_tienda','asistente_tienda','jefe_area','caja','almacenero','vendedor','asistente','trabajador') FOR UPDATE;
      IF v_usuario.id IS NULL OR v_usuario.tienda_id IS NULL OR v_usuario.tienda_id=p_tienda_id THEN
        RAISE EXCEPTION 'Selecciona un trabajador activo de otra tienda' USING ERRCODE='22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.asistencias WHERE usuario_id=v_usuario.id AND fecha=v_fecha AND estado='apoyo_ingreso') THEN
        RAISE EXCEPTION 'El trabajador ya tiene un apoyo de ingreso registrado hoy' USING ERRCODE='23505';
      END IF;
    ELSE
      IF length(btrim(coalesce(v_item->>'nombre_manual',''))) NOT BETWEEN 1 AND 200
        OR length(btrim(coalesce(v_item->>'origen_manual',''))) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION 'Completa nombre y procedencia' USING ERRCODE='22023';
      END IF;
      IF NULLIF(v_item->>'dni_manual','') IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.asistencias a JOIN public.cobertura_trabajadores ct ON ct.id=a.cobertura_trabajador_id
        WHERE a.fecha=v_fecha AND a.estado='apoyo_ingreso' AND ct.dni_manual=v_item->>'dni_manual'
      ) THEN RAISE EXCEPTION 'El DNI ya tiene un apoyo de ingreso hoy' USING ERRCODE='23505'; END IF;
    END IF;
    INSERT INTO public.cobertura_trabajadores(cobertura_id,usuario_id,area,tipo_cobertura,tienda_origen_id,tienda_destino_id,observacion,nombre_manual,dni_manual,origen_manual,horas)
      VALUES(v_cobertura.id,v_usuario.id,NULLIF(v_item->>'area',''),'apoyo',v_usuario.tienda_id,p_tienda_id,NULLIF(v_item->>'observacion',''),
        CASE WHEN v_usuario.id IS NULL THEN btrim(v_item->>'nombre_manual') END,
        CASE WHEN v_usuario.id IS NULL THEN NULLIF(v_item->>'dni_manual','') END,
        CASE WHEN v_usuario.id IS NULL THEN btrim(v_item->>'origen_manual') END,v_horas) RETURNING * INTO v_detalle;
    IF v_usuario.id IS NOT NULL THEN
      SELECT estado INTO v_estado FROM public.asistencias WHERE usuario_id=v_usuario.id AND tienda_id=v_usuario.tienda_id AND fecha=v_fecha;
      INSERT INTO public.asistencias(usuario_id,tienda_id,fecha,estado,registrado_por)
        VALUES(v_usuario.id,v_usuario.tienda_id,v_fecha,'apoyo',p_creado_por)
        ON CONFLICT(usuario_id,tienda_id,fecha) DO UPDATE SET estado='apoyo',registrado_por=p_creado_por;
      INSERT INTO public.log_asistencias(usuario_id,tienda_id,fecha,operacion,estado_anterior,estado_nuevo,realizado_por)
        VALUES(v_usuario.id,v_usuario.tienda_id,v_fecha,CASE WHEN v_estado IS NULL THEN 'creacion' ELSE 'edicion' END,v_estado,'apoyo',p_creado_por);
    END IF;
    INSERT INTO public.asistencias(usuario_id,tienda_id,fecha,estado,registrado_por,observaciones,cobertura_trabajador_id)
      VALUES(v_usuario.id,p_tienda_id,v_fecha,'apoyo_ingreso',p_creado_por,v_detalle.observacion,v_detalle.id);
    INSERT INTO public.log_asistencias(usuario_id,tienda_id,fecha,operacion,estado_nuevo,realizado_por,cobertura_trabajador_id)
      VALUES(v_usuario.id,p_tienda_id,v_fecha,'creacion','apoyo_ingreso',p_creado_por,v_detalle.id);
  END LOOP;
  RETURN to_jsonb(v_cobertura);
END $$;
REVOKE ALL ON FUNCTION public.registrar_cobertura_diaria(integer,integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_cobertura_diaria(integer,integer,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
