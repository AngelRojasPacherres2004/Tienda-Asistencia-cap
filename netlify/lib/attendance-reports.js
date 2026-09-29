import { validatePreferences, sendAttendanceMail } from "./attendance-mail.js";

const staffRoles = ["jefe_tienda", "asistente_tienda", "jefe_seguridad", "jefe_area", "seguridad", "caja", "almacenero", "vendedor", "asistente", "trabajador"];
const presentStates = new Set(["presente", "tardanza", "medio_turno", "apoyo"]);
export function limaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}
export function nextReportRun(hour, now = new Date()) {
  const date = new Date(`${limaDate(now)}T${hour.slice(0, 5)}:00-05:00`);
  if (date <= now) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}
export function validateSchedule(input, stores, now = new Date()) {
  const nombre = String(input.nombre || "").trim();
  const asunto = String(input.asunto || "").trim();
  const hora = String(input.hora || "");
  const tienda_id = input.tienda_id === "" || input.tienda_id == null ? null : Number(input.tienda_id);
  if (nombre.length < 2 || nombre.length > 100 || asunto.length < 2 || asunto.length > 150 || /[\r\n]/.test(asunto)) throw new Error("Ingresa un nombre y asunto válidos.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora) || typeof input.activo !== "boolean") throw new Error("Selecciona una hora y estado válidos.");
  if (tienda_id !== null && (!Number.isInteger(tienda_id) || !stores.some(store => Number(store.id) === tienda_id))) throw new Error("La tienda no pertenece a tu clúster.");
  const { destinatarios } = validatePreferences({ activo: true, registros: true, faltas: false, tardanzas: false, destinatarios: input.destinatarios });
  return { nombre, asunto, hora, activo: input.activo, tienda_id, destinatarios, proximo_envio: nextReportRun(hora, now), updated_at: now.toISOString() };
}
async function allRows(build) {
  const result = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await build().range(offset, offset + 499);
    if (error) throw error;
    result.push(...data);
    if (data.length < 500) return result;
  }
}
export async function zonalReportStores(db, userId) {
  const { data: user, error: userError } = await db.from("usuarios").select("id").eq("id", userId).eq("rol", "jefe_zonal").eq("estado", "activo").maybeSingle();
  if (userError) throw userError;
  if (!user) throw new Error("El jefe zonal no está activo.");
  const { data: cluster, error } = await db.from("clusters").select("id").eq("jefe_zonal_id", userId).eq("estado", "activo").maybeSingle();
  if (error) throw error;
  if (!cluster) return [];
  return allRows(() => db.from("tiendas").select("id,nombre").eq("cluster_id", cluster.id).eq("estado", "activo").order("id"));
}
export function reportSummary(people, attendance, stores) {
  const marks = new Map(attendance.map(row => [Number(row.usuario_id), row.estado]));
  const names = new Map(stores.map(store => [Number(store.id), store.nombre]));
  const rows = people.map(person => ({ nombre: `${person.nombres} ${person.apellidos}`, tienda: names.get(Number(person.tienda_id)) || "", estado: marks.get(Number(person.id)) || "sin_registro" }));
  return { rows, total: rows.length, asistentes: rows.filter(row => presentStates.has(row.estado)).length, faltas: rows.filter(row => row.estado === "falta").length, sin_registro: rows.filter(row => row.estado === "sin_registro").length, otros: rows.filter(row => !presentStates.has(row.estado) && !["falta", "sin_registro"].includes(row.estado)).length };
}
export function attendanceCsv(rows) {
  const cell = value => { let text = String(value); if (/^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
  return "\ufeff" + [["Trabajador", "Tienda", "Estado"], ...rows.map(row => [row.nombre, row.tienda, row.estado.replaceAll("_", " ")])].map(row => row.map(cell).join(";")).join("\r\n");
}
export async function sendScheduledReport(db, schedule, date, type = "manual", send = sendAttendanceMail) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date || date > limaDate()) throw new Error("Selecciona una fecha válida, hasta hoy.");
  const preferences = validatePreferences({ activo: true, registros: true, faltas: false, tardanzas: false, destinatarios: schedule.destinatarios });
  const { data: entry, error: entryError } = await db.from("envios_asistencia_zonal").insert({ programacion_id: schedule.id, usuario_id: schedule.usuario_id, nombre: schedule.nombre, fecha: date, tipo: type, destinatarios: preferences.destinatarios }).select().single();
  if (entryError?.code === "23505" && type === "automatico") return { estado: "duplicado" };
  if (entryError) throw entryError;
  let summary;
  try {
    let stores = await zonalReportStores(db, schedule.usuario_id);
    if (schedule.tienda_id) {
      stores = stores.filter(store => Number(store.id) === Number(schedule.tienda_id));
      if (!stores.length) throw new Error("La tienda seleccionada ya no pertenece al clúster activo del zonal.");
    }
    if (!stores.length) throw new Error("El clúster no tiene tiendas activas.");
    const ids = stores.map(store => store.id);
    const [people, marks] = await Promise.all([
      allRows(() => db.from("usuarios").select("id,nombres,apellidos,tienda_id").in("tienda_id", ids).in("rol", staffRoles).eq("estado", "activo").lte("fecha_ingreso", date).or(`fecha_salida.is.null,fecha_salida.gte.${date}`).order("id")),
      allRows(() => db.from("asistencias").select("usuario_id,estado").in("tienda_id", ids).eq("fecha", date).order("id")),
    ]);
    summary = reportSummary(people, marks, stores);
    const text = [`Reporte de asistencia · ${date}`, "Zona horaria: America/Lima", `Alcance: ${stores.map(store => store.nombre).join(", ")}`, "Personal actualmente activo, incorporado hasta la fecha elegida.", `Total: ${summary.total} | Asistentes: ${summary.asistentes} | Faltas: ${summary.faltas} | Sin registro: ${summary.sin_registro} | Otros estados: ${summary.otros}`, "", ...summary.rows.map(row => `${row.nombre} · ${row.tienda} · ${row.estado.replaceAll("_", " ")}`), "", "Sin registro significa que no se guardó asistencia; no equivale a una falta. Tardanza, medio turno y apoyo cuentan como asistencia."].join("\n");
    await send(preferences, `${schedule.asunto} · ${date}`, text, [{ filename: `asistencia-${date}.csv`, content: attendanceCsv(summary.rows), contentType: "text/csv; charset=utf-8" }]);
  } catch (error) {
    const detail = ["EAUTH", "ESOCKET", "ETIMEDOUT", "ECONNECTION"].includes(error.code) ? "No se pudo conectar o autenticar con Gmail. Revisa las credenciales del servidor." : error.message || "No se pudo enviar el reporte.";
    const { error: logError } = await db.from("envios_asistencia_zonal").update({ estado: "error", detalle: detail.slice(0, 500), ...(summary ? { asistentes: summary.asistentes, faltas: summary.faltas, sin_registro: summary.sin_registro } : {}) }).eq("id", entry.id);
    if (logError) throw logError;
    return { estado: "error", detalle: detail };
  }
  const { error: finalError } = await db.from("envios_asistencia_zonal").update({ estado: "enviado", enviado_at: new Date().toISOString(), asistentes: summary.asistentes, faltas: summary.faltas, sin_registro: summary.sin_registro }).eq("id", entry.id);
  if (finalError) throw finalError;
  const { error: scheduleError } = await db.from("programaciones_asistencia_zonal").update({ ultimo_envio: new Date().toISOString() }).eq("id", schedule.id);
  if (scheduleError) throw scheduleError;
  return { estado: "enviado" };
}
