import { readRows } from "./read-rows.js";
import { documentNotificationGroups, documentNotificationMail } from "./document-notifications.js";
import { reportEmailLayout, reportEmailTable, escapeHtml } from "./report-email-layout.js";

export { selectedReportTypes, REPORT_LABELS as reportTypeLabels } from "../../shared/notificationReports.js";

export function trafficReportContent(stores, traffic, date) {
  const sections = stores.map(store => {
    const rows = traffic.filter(row => Number(row.tienda_id) === Number(store.id)).sort((a, b) => a.rango_hora.localeCompare(b.rango_hora));
    return { store, rows, total: rows.reduce((sum, row) => sum + Number(row.cantidad || 0), 0) };
  });
  const text = [`Reporte de tráfico · ${date} · America/Lima`, "Totales de visitas registradas; una tienda sin registros no equivale a cero visitas.", "", ...sections.flatMap(({store,rows,total}) => [`Tienda: ${store.nombre}`, rows.length ? `Total registrado: ${total} visitas (${rows.length} registros)` : "Sin registros de tráfico para esta fecha", ...rows.map(row => `${row.rango_hora}: ${row.cantidad} visitas${row.observaciones ? ` · ${row.observaciones}` : ""}`), ""])].join("\n");
  const content = sections.map(({store,rows,total}) => `<h2 style="font-size:18px;margin:26px 0 10px">${escapeHtml(store.nombre)}</h2><p style="font-size:14px;color:#5d5549">${rows.length ? `${total} visitas registradas · ${rows.length} horario(s)` : "Sin registros de tráfico para esta fecha"}</p>${rows.length ? reportEmailTable(["Horario", "Visitas", "Observaciones"], rows.map(row => [row.rango_hora, row.cantidad, row.observaciones || "—"])) : ""}`).join("");
  const html = reportEmailLayout("Reporte diario de tráfico", date, [
    { label: "Visitas registradas", value: sections.reduce((sum, section) => sum + section.total, 0), color: "#176842" },
    { label: "Tiendas con registros", value: sections.filter(section => section.rows.length).length },
    { label: "Tiendas sin registro", value: sections.filter(section => !section.rows.length).length, color: "#9b6513" },
  ], content, "Las visitas corresponden a los horarios registrados. Una tienda sin registros no equivale a cero visitas.");
  return { text, html, attachments: [] };
}

export async function otherScheduledReportContent(db, category, stores, date) {
  const ids = stores.map(store => store.id);
  if (category === "trafico") {
    const traffic = await readRows(db.from("trafico_tienda").select("id,tienda_id,rango_hora,cantidad,observaciones").in("tienda_id", ids).eq("fecha", date).order("id"));
    return trafficReportContent(stores, traffic, date);
  }
  const [documents, administrators] = await Promise.all([
    readRows(db.from("documentos_municipales").select("id,tienda_id,tipo_documento,codigo,fecha_vencimiento,dias_alerta,responsables,area_responsable,estado").in("tienda_id", ids).order("id")),
    readRows(db.from("usuarios").select("id,tienda_id,nombres,apellidos,rol,estado").in("tienda_id", ids).eq("rol", "jefe_tienda").eq("estado", "activo").order("id")),
  ]);
  const groups = documentNotificationGroups(stores, documents, administrators, { documentos_vencidos: true, documentos_por_vencer: true }, date);
  if (!groups.length) {
    const text = `Documentos · ${date} · America/Lima\nTiendas: ${stores.map(store => store.nombre).join(", ")}\nNo hay documentos vencidos ni dentro de su plazo de alerta. Los documentos sin fecha de vencimiento no se consideran alertas.`;
    return { text, html: reportEmailLayout("Alertas de documentos", date, [{ label: "Documentos con alerta", value: 0 }, { label: "Tiendas consultadas", value: stores.length }], `<p style="line-height:1.6">${escapeHtml(text).replaceAll("\n", "<br>")}</p>`, "Se evalúan los documentos con fecha de vencimiento dentro del alcance de esta programación."), attachments: [] };
  }
  const mail = documentNotificationMail(groups, date);
  return { text: mail.text, html: mail.html, attachments: [] };
}
