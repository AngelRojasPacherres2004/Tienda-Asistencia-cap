import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const marker = "[DEMO EMANCIPACIÓN 2026]";
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const check = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data || []; };
const storeRows = check(await db.from("tiendas").select("id,nombre,jefe_id").ilike("nombre", "EMANCIPACI%"), "Tienda");
if (storeRows.length !== 1 || storeRows[0].nombre !== "EMANCIPACIÓN") throw new Error("No se identificó de forma unívoca EMANCIPACIÓN.");
const store = storeRows[0];
const people = check(await db.from("usuarios").select("id,rol,estado,fecha_ingreso,fecha_salida").eq("tienda_id", store.id).order("id"), "Personal");
const active = people.filter((person) => person.estado === "activo" && !person.fecha_salida);
const chief = active.find((person) => person.id === store.jefe_id);
if (!chief || active.length < 5) throw new Error("Falta administrador o personal activo; no se insertará nada.");

const dates = [5, 12, 19, 24].flatMap((day) => [5, 6, 7, 8, 9].map((month) => `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`)).sort();
const hours = Array.from({ length: 13 }, (_, index) => {
  const start = index + 9;
  return `${String(start).padStart(2, "0")}:00-${String(start + 1).padStart(2, "0")}:00`;
});
const statuses = ["presente", "presente", "presente", "presente", "presente", "presente", "tardanza", "medio_turno", "apoyo", "falta", "permiso", "descanso_medico"];
const attendance = dates.flatMap((fecha, dayIndex) => active.filter((person) => person.fecha_ingreso <= fecha).map((person, personIndex) => {
  const estado = statuses[(dayIndex * 5 + personIndex * 7) % statuses.length];
  return { tienda_id: store.id, usuario_id: person.id, fecha, estado,
    hora_entrada: ["presente", "tardanza", "medio_turno", "apoyo"].includes(estado) ? (estado === "tardanza" ? "09:18:00" : "09:00:00") : null,
    hora_salida: ["presente", "tardanza", "medio_turno", "apoyo"].includes(estado) ? (estado === "medio_turno" ? "13:00:00" : "18:00:00") : null,
    observaciones: { presente: "Asistencia registrada.", tardanza: "Ingreso posterior a la hora prevista.", medio_turno: "Medio turno registrado.", apoyo: "Apoyo registrado en la jornada.", falta: "Ausencia registrada; motivo no indicado.", permiso: "Permiso registrado; detalle no indicado.", descanso_medico: "Descanso médico registrado; detalle no indicado." }[estado], registrado_por: chief.id };
}));
const traffic = dates.flatMap((fecha, dayIndex) => hours.map((rango_hora, hourIndex) => {
  const peak = Math.max(0, 5 - Math.abs(hourIndex - 6));
  const cantidad = 11 + (dayIndex * 13 + hourIndex * 7) % 19 + peak * 9;
  return { tienda_id: store.id, fecha, rango_hora, hora: `${String(hourIndex + 9).padStart(2, "0")}:30:00`, cantidad,
    observaciones: `${marker} Afluencia horaria de ejemplo.`, registrado_por: chief.id };
}));
const totals = new Map(dates.map((fecha) => [fecha, traffic.filter((row) => row.fecha === fecha).reduce((sum, row) => sum + row.cantidad, 0)]));
const bitacora = dates.map((fecha, index) => ({ tienda_id: store.id, fecha, venta_dia: 4200 + totals.get(fecha) * 12 + index * 41,
  trafico: totals.get(fecha), categoria: "Operación diaria", evento: `${marker} Jornada regular`,
  descripcion: `${marker} Cierre de ejemplo: afluencia, atención en caja y reposición de productos.`, creado_por: chief.id }));
const staff = active.filter((person) => person.id !== chief.id);
const errors = [
  ["2026-05-19", "Etiquetado", "Se detectó una etiqueta desactualizada durante la revisión de apertura.", "Se corrigió la etiqueta y se verificó el lote."],
  ["2026-06-12", "Inventario", "Se registró una diferencia menor en el conteo de una referencia.", "Se efectuó recuento y se actualizó el control."],
  ["2026-07-24", "Atención", "Una consulta de cliente quedó pendiente de seguimiento al cierre del turno.", "Se asignó responsable y se respondió al día siguiente."],
  ["2026-08-19", "Caja", "Se identificó una omisión en el registro de una devolución de prueba.", "Se revisó el procedimiento con el equipo."],
  ["2026-09-12", "Reposición", "Un producto permaneció temporalmente fuera de su ubicación señalizada.", "Se repuso en el área correcta y se reforzó la lista de revisión."],
].map(([fecha, categoria, descripcion, accion_correctiva], index) => ({ tienda_id: store.id, usuario_id: staff[index % staff.length].id,
  fecha, categoria: `${marker} ${categoria}`, descripcion: `${marker} Caso ficticio. ${descripcion}`,
  accion_correctiva: `${marker} ${accion_correctiva}`, registrado_por: chief.id }));
const incidents = [
  ["2026-06-19", "falla_interna", "caja", "Lector de códigos con lectura intermitente", "Se observó lentitud temporal en un lector de caja."],
  ["2026-08-05", "problema_operativo", "almacen", "Diferencia de ubicación en reposición", "Se identificaron productos ubicados en un estante distinto al asignado."],
  ["2026-09-19", "dano_infraestructura", "piso_venta", "Señalización de pasillo desprendida", "Se detectó una señal de pasillo que requería reposición."],
].map(([fecha, tipo, area, asunto, descripcion]) => ({ tienda_id: store.id, fecha: `${fecha}T11:00:00-05:00`,
  tipo, area, asunto: `${marker} ${asunto}`, descripcion: `${marker} Caso ficticio. ${descripcion}`,
  gravedad: "baja", estado: "cerrada", intervencion: false, detencion: false, registrado_por: chief.id,
  notificacion_estado: "pendiente" }));
const documents = [
  ["Mantenimiento preventivo de extintores", "Seguridad", "2026-10-14"],
  ["Revisión de luces de emergencia", "Seguridad", "2026-11-06"],
  ["Inspección interna de señalética", "Operaciones", "2026-12-02"],
].map(([tipo_documento, area_responsable, fecha_vencimiento], index) => ({ tienda_id: store.id,
  codigo: `DEMO-EM-${index + 1}`, tipo_documento: `${marker} ${tipo_documento}`, area_responsable,
  frecuencia_revision: "Anual", fecha_emision: "2026-04-01", fecha_vencimiento, estado: "vigente", creado_por: chief.id }));
const actions = [
  ["2026-06-20", "Mantenimiento", "Verificar lector de códigos en caja", "completada"],
  ["2026-08-06", "Inventario", "Reordenar referencias de alta rotación", "completada"],
  ["2026-09-20", "Seguridad", "Renovar señalización del pasillo central", "en_progreso"],
].map(([fecha, tipo, accion, estado]) => ({ tienda_id: store.id, fecha, tipo, accion: `${marker} ${accion}`,
  responsable: "Administrador de tienda", estado, objetivo: `${marker} Mejorar la operación de ejemplo.`, creado_por: chief.id }));
const improvements = [
  { fecha: "2026-07-12", seccion: "Ventas", area: "Textil", que_mejoro: "Distribución de tallas de alta rotación", como_se_hizo: "Se reorganizaron percheros según demanda observada.", estado: "completada" },
  { fecha: "2026-09-05", seccion: "Operaciones", area: "Almacén", que_mejoro: "Orden de referencias de reposición", como_se_hizo: "Se etiquetaron espacios y se aplicó una revisión semanal.", estado: "en_progreso" },
].map((row) => ({ ...row, tienda_id: store.id, responsable: "Administrador de tienda", que_mejoro: `${marker} ${row.que_mejoro}`,
  como_se_hizo: `${marker} ${row.como_se_hizo}`, resultado_beneficio: `${marker} Ejemplo de seguimiento.`, creado_por: chief.id }));
const requirements = [
  ["2026-08-12", "Etiquetas para reposición", "corto_plazo", "atendido"],
  ["2026-09-19", "Señalización de pasillo central", "urgente", "en_proceso"],
].map(([fecha_inicio, requerimiento, urgencia, estado]) => ({ tienda_id: store.id,
  requerimiento: `${marker} ${requerimiento}`, cantidad: 1, areas_responsables: ["Operaciones"], urgencia,
  fecha_inicio, fecha_fin_objetivo: "2026-10-15", estado, comentario: `${marker} Solicitud ficticia.`, creado_por: chief.id }));
const claims = [
  ["2026-07-19", "queja", "Demora de atención en horario de mayor afluencia", "respondido"],
  ["2026-09-05", "reclamo", "Consulta por disponibilidad de talla", "en_atencion"],
].map(([fecha, tipo, detalle, estado], index) => ({ tienda_id: store.id, codigo_hoja: `DEMO-EM-2026-${index + 1}`,
  fecha, consumidor_nombre: "Cliente de ejemplo", producto_servicio: "Atención en tienda", tipo,
  detalle: `${marker} Caso ficticio. ${detalle}`, pedido_consumidor: `${marker} Solicita seguimiento.`,
  responsable: "Administrador de tienda", estado, creado_por: chief.id }));
const courseRows = check(await db.from("cursos").select("id,nombre,activo").eq("activo", true).order("id").limit(3), "Cursos");
const training = courseRows.flatMap((course, courseIndex) => staff.slice(0, 4).map((person, personIndex) => {
  const estado = (courseIndex + personIndex) % 4 === 0 ? "en_curso" : "completado";
  return { curso_id: course.id, usuario_id: person.id, tienda_id: store.id, estado,
    duracion_horas: estado === "completado" ? 2 : null, fecha_finalizacion: estado === "completado" ? "2026-09-12" : null,
    nota: estado === "completado" ? 15 + (courseIndex + personIndex) % 5 : null,
    resultado: estado === "completado" ? "aprobado" : null, actualizado_por: chief.id };
}));

const plans = [
  ["asistencias", attendance, ["usuario_id", "fecha"]],
  ["trafico_tienda", traffic, ["fecha", "rango_hora"]],
  ["bitacora_tienda", bitacora, ["fecha"]],
  ["errores_personal", errors, ["usuario_id", "fecha", "categoria"]],
  ["incidencias", incidents, ["asunto"]],
  ["documentos_municipales", documents, ["codigo"]],
  ["acciones_tienda", actions, ["accion"]],
  ["mejoras_continuas", improvements, ["que_mejoro"]],
  ["requerimientos_tienda", requirements, ["requerimiento"]],
  ["reclamaciones_tienda", claims, ["codigo_hoja"]],
  ["capacitacion_progreso", training, ["curso_id", "usuario_id"]],
];
for (const [table, planned, keyFields] of plans) {
  const existing = check(await db.from(table).select(keyFields.join(",")).eq("tienda_id", store.id).limit(1000), table);
  const key = (row) => keyFields.map((field) => field === "fecha" ? String(row[field]).slice(0, 10) : String(row[field])).join("|");
  const existingKeys = new Set(existing.map(key));
  const pending = planned.filter((row) => !existingKeys.has(key(row)));
  console.log(`${table}: ${pending.length} para insertar, ${planned.length - pending.length} existentes`);
  if (!apply || !pending.length) continue;
  for (let offset = 0; offset < pending.length; offset += 100) {
    check(await db.from(table).insert(pending.slice(offset, offset + 100)).select("id"), `${table} insertar`);
  }
  const after = check(await db.from(table).select(keyFields.join(",")).eq("tienda_id", store.id).limit(1000), `${table} verificar`);
  if (pending.some((row) => !new Set(after.map(key)).has(key(row)))) throw new Error(`${table}: la verificación no encontró todos los registros.`);
}
console.log(apply ? "Siembra DEMO completada." : "Vista previa. Usa --apply para insertar.");
