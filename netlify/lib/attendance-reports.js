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
  const rows = people.map(person => ({ nombre: `${person.nombres} ${person.apellidos}`, tienda_id: Number(person.tienda_id), tienda: names.get(Number(person.tienda_id)) || "", estado: marks.get(Number(person.id)) || "sin_registro" }));
  return { rows, total: rows.length, asistentes: rows.filter(row => presentStates.has(row.estado)).length, faltas: rows.filter(row => row.estado === "falta").length, sin_registro: rows.filter(row => row.estado === "sin_registro").length, otros: rows.filter(row => !presentStates.has(row.estado) && !["falta", "sin_registro"].includes(row.estado)).length };
}
export function attendanceCsv(rows) {
  const cell = value => { let text = String(value); if (/^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
  return "\ufeff" + [["Trabajador", "Tienda", "Estado"], ...rows.map(row => [row.nombre, row.tienda, row.estado.replaceAll("_", " ")])].map(row => row.map(cell).join(";")).join("\r\n");
}
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const stateLabel = state => String(state || "sin_registro").replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());

export function attendanceReportHtml(summary, stores, date) {
  const displayDate = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00Z`));
  const metric = (label, value, color, span = false) => `<td ${span ? 'colspan="2"' : 'width="50%"'} style="padding:5px;vertical-align:top"><div style="background:#f7f5f0;border:1px solid #e9e4da;border-radius:10px;padding:14px 8px;text-align:center"><div style="color:${color};font-size:25px;font-weight:700;line-height:1.1">${value}</div><div style="color:#5d5549;font-size:13px;margin-top:6px;white-space:nowrap">${label}</div></div></td>`;
  const sections = stores.map(store => {
    const rows = summary.rows.filter(row => row.tienda_id === Number(store.id));
    const body = rows.length ? rows.map((row, index) => `<tr><td style="padding:10px 12px;border-bottom:1px solid #eee9df;background:${index % 2 ? "#faf9f6" : "#ffffff"};color:#24211d">${escapeHtml(row.nombre)}</td><td style="padding:10px 12px;border-bottom:1px solid #eee9df;background:${index % 2 ? "#faf9f6" : "#ffffff"};color:#514a3e;white-space:nowrap">${escapeHtml(stateLabel(row.estado))}</td></tr>`).join("") : '<tr><td colspan="2" style="padding:12px;color:#6c655b">Sin personal activo para la fecha.</td></tr>';
    return `<h2 style="font-size:18px;color:#24211d;margin:28px 0 10px">${escapeHtml(store.nombre)} <span style="font-size:13px;font-weight:400;color:#6c655b">(${rows.length})</span></h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e9e4da;border-radius:8px;font-size:14px"><thead><tr style="background:#f0e7d4;text-align:left"><th style="padding:10px 12px;color:#493b20">Trabajador</th><th style="padding:10px 12px;color:#493b20">Estado</th></tr></thead><tbody>${body}</tbody></table>`;
  }).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:12px 4px;background:#f3f1ed;font-family:Arial,Helvetica,sans-serif;color:#24211d"><table role="presentation" align="center" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-collapse:collapse;border:1px solid #e9e4da"><tr><td style="background:#171613;padding:22px 18px"><div style="color:#dfbb6b;font-size:15px;font-weight:700;letter-spacing:.05em">ASISTE</div><h1 style="color:#ffffff;font-size:23px;line-height:1.25;margin:13px 0 4px">Reporte diario de asistencia</h1><div style="color:#d7d1c5;font-size:14px">${escapeHtml(displayDate)} · America/Lima</div></td></tr><tr><td style="padding:20px 12px"><p style="font-size:14px;color:#5d5549;line-height:1.5;margin:0 0 16px">${stores.length === 1 ? `Tienda: ${escapeHtml(stores[0].nombre)}` : `${stores.length} tiendas activas del clúster`} · Personal actualmente activo, incorporado hasta la fecha indicada.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed"><tr>${metric("Total", summary.total, "#24211d", true)}</tr><tr>${metric("Asistentes", summary.asistentes, "#176842")}${metric("Faltas", summary.faltas, "#b53232")}</tr><tr>${metric("Sin registro", summary.sin_registro, "#9b6513")}${metric("Otros", summary.otros, "#55516e")}</tr></table><h2 style="font-size:19px;color:#24211d;margin:24px 0 0">Detalle de asistencia</h2>${sections}<div style="background:#fff8e9;border-left:4px solid #d6a846;padding:12px 14px;margin:22px 0;font-size:13px;line-height:1.5;color:#51452e"><strong>Cómo leer el reporte:</strong> “Sin registro” significa que no se guardó una marca; no equivale a una falta. Tardanza, medio turno y apoyo cuentan como asistencia.</div><p style="font-size:13px;color:#6c655b;line-height:1.5;margin:24px 0 0">El mismo detalle también está adjunto en formato CSV.</p></td></tr><tr><td style="background:#f7f5f0;padding:16px 20px;color:#766e62;font-size:12px">Asiste · Reporte automático de asistencia</td></tr></table></body></html>`;
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
    await send(preferences, `${schedule.asunto} · ${date}`, text, [{ filename: `asistencia-${date}.csv`, content: attendanceCsv(summary.rows), contentType: "text/csv; charset=utf-8" }], attendanceReportHtml(summary, stores, date));
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
