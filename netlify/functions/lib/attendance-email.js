import nodemailer from "nodemailer";

const attendedStates = new Set(["presente", "tardanza", "medio_turno", "apoyo"]);
const stateLabels = { presente: "Asistencia", tardanza: "Tardanza", medio_turno: "Medio turno", apoyo: "Apoyo", falta: "Falta", permiso: "Permiso", descanso_medico: "Descanso médico", suspension: "Suspensión" };

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export function limaNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export async function buildAttendanceReport(supabase, schedule, reportDate) {
  let workersQuery = supabase.from("usuarios").select("id,nombres,apellidos,dni,rol,tienda_id,tiendas!usuarios_tienda_id_fkey(nombre)").eq("estado", "activo").in("rol", ["empleado", "vendedor", "seguridad", "jefe_tienda"]);
  if (schedule.alcance === "especificos") workersQuery = workersQuery.in("id", schedule.usuario_ids || []);
  const { data: workers, error: workersError } = await workersQuery.order("nombres");
  if (workersError) throw workersError;
  const ids = (workers || []).map((worker) => worker.id);
  const { data: marks, error: marksError } = ids.length
    ? await supabase.from("asistencias").select("usuario_id,estado,hora_entrada,hora_salida,observaciones").eq("fecha", reportDate).in("usuario_id", ids)
    : { data: [], error: null };
  if (marksError) throw marksError;
  const byUser = new Map((marks || []).map((mark) => [mark.usuario_id, mark]));
  const rows = (workers || []).map((worker) => {
    const mark = byUser.get(worker.id);
    const attended = !!mark && attendedStates.has(mark.estado);
    return { nombre: `${worker.nombres} ${worker.apellidos}`.trim(), dni: worker.dni, tienda: worker.tiendas?.nombre || "—", rol: worker.rol, asistio: attended, estado: mark ? stateLabels[mark.estado] || mark.estado : "Sin marcación", entrada: mark?.hora_entrada || "—", retiro: mark?.hora_salida || "—", observaciones: mark?.observaciones || "" };
  });
  return { rows, attended: rows.filter((row) => row.asistio).length, absent: rows.filter((row) => !row.asistio).length };
}

export async function sendAttendanceEmail(supabase, schedule, reportDate) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) throw new Error("Faltan GMAIL_USER y GMAIL_APP_PASSWORD en Netlify.");
  const report = await buildAttendanceReport(supabase, schedule, reportDate);
  const tableRows = report.rows.map((row) => `<tr><td>${escapeHtml(row.nombre)}</td><td>${escapeHtml(row.tienda)}</td><td>${escapeHtml(row.estado)}</td><td>${escapeHtml(row.entrada)}</td><td>${escapeHtml(row.retiro)}</td></tr>`).join("");
  const csv = ["Nombre,DNI,Tienda,Rol,Asistió,Estado,Hora de marcado,Retiro,Observaciones", ...report.rows.map((row) => [row.nombre, row.dni, row.tienda, row.rol, row.asistio ? "Sí" : "No", row.estado, row.entrada, row.retiro, row.observaciones].map(csvCell).join(","))].join("\r\n");
  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  await transporter.sendMail({
    from: process.env.GMAIL_FROM || process.env.GMAIL_USER,
    to: process.env.GMAIL_USER,
    bcc: schedule.destinatarios,
    subject: schedule.asunto.replaceAll("{fecha}", reportDate),
    html: `<div style="font-family:Arial,sans-serif;color:#172235"><h2>Reporte de asistencia · ${escapeHtml(reportDate)}</h2><p><strong>${report.attended}</strong> asistieron · <strong>${report.absent}</strong> no asistieron</p><table style="width:100%;border-collapse:collapse"><thead><tr><th align="left">Trabajador</th><th align="left">Tienda</th><th align="left">Estado</th><th align="left">Marcado</th><th align="left">Retiro</th></tr></thead><tbody>${tableRows}</tbody></table></div>`,
    attachments: [{ filename: `asistencia-${reportDate}.csv`, content: `\ufeff${csv}`, contentType: "text/csv; charset=utf-8" }],
  });
  return report;
}
