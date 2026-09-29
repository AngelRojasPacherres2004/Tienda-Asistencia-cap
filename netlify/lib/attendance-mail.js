import nodemailer from "nodemailer";

export const defaultPreferences = { activo: false, registros: true, faltas: true, tardanzas: true, destinatarios: [] };
export function validatePreferences(input) {
  if (!input || ["activo", "registros", "faltas", "tardanzas"].some(key => typeof input[key] !== "boolean") || !Array.isArray(input.destinatarios)) throw new Error("La configuración de avisos no es válida.");
  const recipients = [...new Set(input.destinatarios.map(value => String(value).trim().toLowerCase()))];
  if (recipients.length > 20 || recipients.some(value => value.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value))) throw new Error("Ingresa hasta 20 correos válidos.");
  if (input.activo && (!recipients.length || !input.registros && !input.faltas && !input.tardanzas)) throw new Error("Selecciona al menos un tipo de aviso y un destinatario.");
  return { ...Object.fromEntries(["activo", "registros", "faltas", "tardanzas"].map(key => [key, input[key]])), destinatarios: recipients };
}
export function matchingAttendance(rows, preferences) {
  return rows.filter(row => preferences.registros || preferences.faltas && row.estado === "falta" || preferences.tardanzas && row.estado === "tardanza");
}
export const mailConfigured = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
export async function sendAttendanceMail(preferences, subject, text, attachments = []) {
  if (!mailConfigured()) throw new Error("Configura GMAIL_USER y GMAIL_APP_PASSWORD en el servidor.");
  const mail = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, "") }, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000 });
  const result = await mail.sendMail({ from: { name: "Asiste · Asistencias", address: process.env.GMAIL_USER }, bcc: preferences.destinatarios, subject, text, attachments });
  if (result.rejected?.length) throw new Error("Uno o más destinatarios fueron rechazados. Revisa los correos configurados.");
}
