export const REPORT_TYPES = ["asistencia", "trafico", "documentos"];
export const REPORT_LABELS = { asistencia: "Asistencia", trafico: "Tráfico", documentos: "Documentos" };
export function reportSubject(type, date, scheduleName) {
  if (!REPORT_TYPES.includes(type)) throw new Error("El tipo de correo no es válido.");
  const name = String(scheduleName || "").replace(/[\r\n]+/g, " ").trim();
  return `Asiste - ${REPORT_LABELS[type]} · ${date}${name ? ` · ${name}` : ""}`;
}
export function selectedReportTypes(value = "asistencia") {
  const requested = Array.isArray(value) ? value : value === "todos" ? REPORT_TYPES : [value];
  if (!requested.length || requested.some(type => !REPORT_TYPES.includes(type))) throw new Error("Selecciona al menos un tipo de reporte válido.");
  return REPORT_TYPES.filter(type => requested.includes(type));
}
