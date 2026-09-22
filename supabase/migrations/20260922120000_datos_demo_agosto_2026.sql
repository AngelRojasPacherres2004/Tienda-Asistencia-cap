-- Datos demostrativos consistentes para validar tableros, matrices y reportes.
-- Es idempotente: conserva cualquier registro real que ya exista en agosto.
BEGIN;

-- Equipo demostrativo con antigüedad suficiente para que agosto sea coherente.
INSERT INTO public.usuarios
  (nombres, apellidos, dni, usuario, password, telefono, rol, tienda_id, estado, fecha_ingreso)
SELECT persona.nombres, persona.apellidos,
  (70000000 + t.id::integer * 10 + persona.numero)::text,
  'demo.t' || t.id || '.' || persona.numero,
  '!SIN_ACCESO!',
  (900000000 + t.id::integer * 10 + persona.numero)::text,
  persona.rol, t.id, 'activo', DATE '2026-07-01'
FROM public.tiendas t
CROSS JOIN (VALUES
  (1, 'Lucía', 'Mendoza', 'vendedor'),
  (2, 'Diego', 'Salazar', 'caja'),
  (3, 'Valeria', 'Rojas', 'seguridad'),
  (4, 'Mateo', 'Campos', 'almacenero')
) AS persona(numero, nombres, apellidos, rol)
WHERE t.estado='activo'
  AND NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.dni=(70000000 + t.id::integer * 10 + persona.numero)::text
       OR lower(u.usuario)=lower('demo.t' || t.id || '.' || persona.numero)
  );

INSERT INTO public.asistencias
  (usuario_id, tienda_id, fecha, estado, hora_entrada, hora_salida, observaciones, registrado_por)
SELECT
  u.id,
  u.tienda_id,
  d::date,
  CASE
    WHEN EXTRACT(ISODOW FROM d) = 7 THEN 'permiso'
    WHEN (u.id + EXTRACT(DAY FROM d)::integer) % 19 = 0 THEN 'falta'
    WHEN (u.id + EXTRACT(DAY FROM d)::integer) % 11 = 0 THEN 'tardanza'
    WHEN (u.id + EXTRACT(DAY FROM d)::integer) % 23 = 0 THEN 'medio_turno'
    ELSE 'presente'
  END,
  CASE WHEN EXTRACT(ISODOW FROM d) = 7 OR (u.id + EXTRACT(DAY FROM d)::integer) % 19 = 0 THEN NULL
       WHEN (u.id + EXTRACT(DAY FROM d)::integer) % 11 = 0 THEN TIME '09:12'
       ELSE TIME '08:55' END,
  CASE WHEN EXTRACT(ISODOW FROM d) = 7 OR (u.id + EXTRACT(DAY FROM d)::integer) % 19 = 0 THEN NULL
       WHEN (u.id + EXTRACT(DAY FROM d)::integer) % 23 = 0 THEN TIME '14:00'
       ELSE TIME '18:05' END,
  CASE WHEN EXTRACT(ISODOW FROM d) = 7 THEN 'Descanso semanal programado'
       WHEN (u.id + EXTRACT(DAY FROM d)::integer) % 19 = 0 THEN 'Ausencia reportada al administrador'
       WHEN (u.id + EXTRACT(DAY FROM d)::integer) % 11 = 0 THEN 'Ingreso posterior al horario programado'
       ELSE 'Carga demo agosto 2026' END,
  registrar.id
FROM public.usuarios u
CROSS JOIN generate_series(DATE '2026-08-01', DATE '2026-08-31', INTERVAL '1 day') d
JOIN LATERAL (
  SELECT responsable.id
  FROM public.usuarios responsable
  WHERE responsable.tienda_id = u.tienda_id AND responsable.estado = 'activo'
  ORDER BY CASE WHEN responsable.rol = 'jefe_tienda' THEN 0 ELSE 1 END, responsable.id
  LIMIT 1
) registrar ON true
WHERE u.tienda_id IS NOT NULL
  AND u.estado = 'activo'
  AND u.fecha_ingreso <= d::date
  AND (u.fecha_salida IS NULL OR u.fecha_salida >= d::date)
ON CONFLICT (usuario_id, fecha) DO NOTHING;

INSERT INTO public.trafico_tienda
  (tienda_id, fecha, hora, rango_hora, cantidad, observaciones, registrado_por)
SELECT
  t.id,
  d::date,
  make_time(h.hora, 0, 0),
  lpad(h.hora::text, 2, '0') || ':00-' || lpad((h.hora + 1)::text, 2, '0') || ':00',
  GREATEST(4, 10 + ((t.id * 7 + EXTRACT(DAY FROM d)::integer * 3 + h.hora * 5) % 34)
    + CASE WHEN h.hora BETWEEN 17 AND 20 THEN 18 ELSE 0 END
    + CASE WHEN EXTRACT(ISODOW FROM d) IN (6,7) THEN 12 ELSE 0 END),
  CASE WHEN EXTRACT(ISODOW FROM d) IN (6,7) THEN 'Mayor afluencia por fin de semana' ELSE 'Flujo habitual de agosto' END,
  registrar.id
FROM public.tiendas t
CROSS JOIN generate_series(DATE '2026-08-01', DATE '2026-08-31', INTERVAL '1 day') d
CROSS JOIN generate_series(9, 21) h(hora)
JOIN LATERAL (
  SELECT responsable.id
  FROM public.usuarios responsable
  WHERE responsable.tienda_id = t.id AND responsable.estado = 'activo'
  ORDER BY CASE WHEN responsable.rol IN ('seguridad','jefe_seguridad','jefe_tienda') THEN 0 ELSE 1 END, responsable.id
  LIMIT 1
) registrar ON true
WHERE t.estado = 'activo'
ON CONFLICT (tienda_id, fecha, rango_hora) DO NOTHING;

INSERT INTO public.bitacora_tienda
  (tienda_id, fecha, venta_dia, trafico, categoria, evento, descripcion, creado_por)
SELECT t.id, d::date,
  4200 + ((t.id * 311 + EXTRACT(DAY FROM d)::integer * 487) % 7600),
  180 + ((t.id * 19 + EXTRACT(DAY FROM d)::integer * 23) % 390),
  CASE WHEN EXTRACT(ISODOW FROM d) IN (6,7) THEN 'Fin de semana' ELSE 'OperaciÃ³n diaria' END,
  CASE WHEN EXTRACT(DAY FROM d)::integer % 10 = 0 THEN 'ActivaciÃ³n comercial' ELSE 'Jornada regular' END,
  'Cierre operativo y comercial simulado de agosto 2026.', registrar.id
FROM public.tiendas t
CROSS JOIN generate_series(DATE '2026-08-01', DATE '2026-08-31', INTERVAL '1 day') d
JOIN LATERAL (
  SELECT responsable.id FROM public.usuarios responsable
  WHERE responsable.tienda_id=t.id AND responsable.estado='activo'
  ORDER BY CASE WHEN responsable.rol='jefe_tienda' THEN 0 ELSE 1 END, responsable.id LIMIT 1
) registrar ON true
WHERE t.estado='activo'
ON CONFLICT (tienda_id, fecha) DO NOTHING;

DELETE FROM public.tareas_zonales WHERE titulo LIKE '[DEMO AGO 2026]%';
INSERT INTO public.tareas_zonales
  (jefe_zonal_id, tienda_id, titulo, descripcion, responsable, fecha_inicio, fecha_limite, prioridad, estado)
SELECT c.jefe_zonal_id, t.id,
  '[DEMO AGO 2026] RevisiÃ³n semanal ' || semana.numero,
  'Validar asistencia, trÃ¡fico, documentos y pendientes de la semana.',
  COALESCE(j.nombres || ' ' || j.apellidos, 'Administrador de tienda'),
  DATE '2026-08-01' + ((semana.numero - 1) * 7),
  LEAST(DATE '2026-08-31', DATE '2026-08-07' + ((semana.numero - 1) * 7)),
  CASE WHEN semana.numero IN (2,4) THEN 'alta' ELSE 'media' END,
  CASE WHEN semana.numero < 5 THEN 'completada' ELSE 'en_progreso' END
FROM public.tiendas t
JOIN public.clusters c ON c.id=t.cluster_id AND c.jefe_zonal_id IS NOT NULL
LEFT JOIN public.usuarios j ON j.id=t.jefe_id
CROSS JOIN generate_series(1,5) semana(numero)
WHERE t.estado='activo';

DELETE FROM public.observaciones_zonales
WHERE visita_id IN (SELECT id FROM public.visitas_zonales WHERE periodo LIKE 'Agosto 2026 Â· Demo%');
DELETE FROM public.visitas_zonales WHERE periodo LIKE 'Agosto 2026 Â· Demo%';
WITH nuevas_visitas AS (
  INSERT INTO public.visitas_zonales
    (tienda_id, jefe_zonal_id, fecha, periodo, puntaje, observacion_general)
  SELECT t.id, c.jefe_zonal_id,
    DATE '2026-08-08' + ((t.id::integer % 3) * 6),
    'Agosto 2026 Â· Demo',
    76 + (t.id % 20),
    'Visita mensual: operaciÃ³n estable con oportunidades puntuales de mejora.'
  FROM public.tiendas t JOIN public.clusters c ON c.id=t.cluster_id
  WHERE t.estado='activo' AND c.jefe_zonal_id IS NOT NULL
  RETURNING id, tienda_id, fecha
)
INSERT INTO public.observaciones_zonales
  (visita_id, tienda_id, area_item, prioridad, fecha_limite, descripcion, accion_solicitada, estado, comentario)
SELECT id, tienda_id,
  CASE WHEN tienda_id % 2=0 THEN 'DocumentaciÃ³n' ELSE 'Sala de ventas' END,
  CASE WHEN tienda_id % 3=0 THEN 'alta' ELSE 'media' END,
  fecha + 7,
  CASE WHEN tienda_id % 2=0 THEN 'Ordenar y actualizar el archivo documental.' ELSE 'Corregir seÃ±alizaciÃ³n y presentaciÃ³n del Ã¡rea.' END,
  'Presentar evidencia del levantamiento al jefe zonal.',
  CASE WHEN tienda_id % 3=0 THEN 'en_validacion' ELSE 'levantada' END,
  'Registro demostrativo para el flujo de supervisiÃ³n.'
FROM nuevas_visitas;

DELETE FROM public.incidencias_zonales WHERE descripcion LIKE '[DEMO AGO 2026]%';
INSERT INTO public.incidencias_zonales
  (jefe_zonal_id, tipo, alcance, tienda_origen_id, tienda_afectada_id, fecha, descripcion, estado, responsable_seguimiento)
SELECT c.jefe_zonal_id,
  CASE WHEN t.id % 2=0 THEN 'coordinacion_tiendas' ELSE 'proveedor' END,
  CASE WHEN t.id % 2=0 THEN 'entre_tiendas' ELSE 'externa_tienda' END,
  t.id, t.id,
  DATE '2026-08-12' + (t.id::integer % 14),
  '[DEMO AGO 2026] Seguimiento operativo coordinado durante agosto.',
  CASE WHEN t.id % 3=0 THEN 'en_seguimiento' ELSE 'cerrada' END,
  'Jefe Zonal'
FROM public.tiendas t JOIN public.clusters c ON c.id=t.cluster_id
WHERE t.estado='activo' AND c.jefe_zonal_id IS NOT NULL;

DELETE FROM public.mejoras_continuas WHERE que_mejoro LIKE '[DEMO AGO 2026]%';
INSERT INTO public.mejoras_continuas
  (tienda_id, fecha, seccion, area, responsable, que_mejoro, como_se_hizo, estado, resultado_beneficio, creado_por)
SELECT t.id, DATE '2026-08-25', 'Operaciones', 'Sala de ventas',
  COALESCE(j.nombres || ' ' || j.apellidos, 'Equipo de tienda'),
  '[DEMO AGO 2026] DistribuciÃ³n de productos de alta rotaciÃ³n',
  'Se reorganizaron exhibiciones usando el trÃ¡fico por hora y la rotaciÃ³n del mes.',
  'completada', 'Mejor visibilidad y reposiciÃ³n mÃ¡s rÃ¡pida.', registrar.id
FROM public.tiendas t
LEFT JOIN public.usuarios j ON j.id=t.jefe_id
JOIN LATERAL (SELECT id FROM public.usuarios u WHERE u.tienda_id=t.id ORDER BY CASE WHEN u.rol='jefe_tienda' THEN 0 ELSE 1 END, id LIMIT 1) registrar ON true
WHERE t.estado='activo';

COMMIT;

