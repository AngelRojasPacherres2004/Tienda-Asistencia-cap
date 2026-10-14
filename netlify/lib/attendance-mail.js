import nodemailer from "nodemailer";
import { REPORT_LABELS } from "../../shared/notificationReports.js";

export const defaultPreferences = { activo: false, registros: true, faltas: true, tardanzas: true, trafico: false, documentos_vencidos: false, documentos_por_vencer: false, destinatarios: [] };
export function validatePreferences(input) {
  input = input && { trafico: false, documentos_vencidos: false, documentos_por_vencer: false, ...input };
  if (!input || ["activo", "registros", "faltas", "tardanzas", "trafico", "documentos_vencidos", "documentos_por_vencer"].some(key => typeof input[key] !== "boolean") || !Array.isArray(input.destinatarios)) throw new Error("La configuración de avisos no es válida.");
  const recipients = [...new Set(input.destinatarios.map(value => String(value).trim().toLowerCase()))];
  if (recipients.length > 20 || recipients.some(value => value.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value))) throw new Error("Ingresa hasta 20 correos válidos.");
  if (input.activo && (!recipients.length || !input.registros && !input.faltas && !input.tardanzas && !input.trafico && !input.documentos_vencidos && !input.documentos_por_vencer)) throw new Error("Selecciona al menos un tipo de aviso y un destinatario.");
  return { ...Object.fromEntries(["activo", "registros", "faltas", "tardanzas", "trafico", "documentos_vencidos", "documentos_por_vencer"].map(key => [key, input[key]])), destinatarios: recipients };
}
export function matchingAttendance(rows, preferences) {
  return rows.filter(row => preferences.registros || preferences.faltas && row.estado === "falta" || preferences.tardanzas && row.estado === "tardanza");
}
export const mailConfigured = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
export async function sendAttendanceMail(preferences, subject, text, attachments = [], html, category = "asistencia") {
  const senderLabel = REPORT_LABELS[category];
  if (!senderLabel) throw new Error("El tipo de correo no es válido.");
  if (!mailConfigured()) throw new Error("Configura GMAIL_USER y GMAIL_APP_PASSWORD en el servidor.");
  const mail = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, "") }, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000 });
  const result = await mail.sendMail({ from: { name: `Asiste - ${senderLabel}`, address: process.env.GMAIL_USER }, bcc: preferences.destinatarios, subject, text, html, attachments });
  if (result.rejected?.length) throw new Error("Uno o más destinatarios fueron rechazados. Revisa los correos configurados.");
  if (!result.accepted?.length) throw new Error("El servidor de correo no confirmó ningún destinatario aceptado.");
  return { messageId: result.messageId, accepted: result.accepted.length };
}
