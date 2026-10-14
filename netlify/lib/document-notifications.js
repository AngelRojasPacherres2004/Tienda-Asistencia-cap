import { readRows } from "./read-rows.js";
import { reportEmailLayout, reportEmailTable } from "./report-email-layout.js";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const daysBetween = (date, today) => Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);

export function documentNotificationGroups(stores, documents, administrators, preferences, today) {
  const groups = new Map(stores.map(store => {
    const assigned = store.jefe?.estado === "activo" ? [store.jefe] : administrators.filter(person => String(person.tienda_id) === String(store.id) && person.estado === "activo" && person.rol === "jefe_tienda");
    const manager = assigned.map(person => `${person.nombres || ""} ${person.apellidos || ""}`.trim()).filter(Boolean).join(" / ") || "Sin encargado activo asignado";
    return [String(store.id), { id: store.id, name: store.nombre, manager, documents: [] }];
  }));
  for (const document of documents) {
    const group = groups.get(String(document.tienda_id));
    if (!group || !document.fecha_vencimiento) continue;
    const days = daysBetween(document.fecha_vencimiento.slice(0, 10), today);
    const alertDays = Number(document.dias_alerta ?? 30);
    if (!Number.isFinite(days) || !Number.isFinite(alertDays) || alertDays < 0) continue;
    const expired = days < 0;
    if (expired ? !preferences.documentos_vencidos : !preferences.documentos_por_vencer || days > alertDays) continue;
    group.documents.push({ ...document, days, expired, alertDays });
  }
  return [...groups.values()].filter(group => group.documents.length)
    .map(group => ({ ...group, documents: group.documents.sort((a, b) => a.days - b.days || Number(a.id) - Number(b.id)) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function documentNotificationMail(groups, today) {
  const total = groups.reduce((count, group) => count + group.documents.length, 0);
  const deadline = document => document.expired ? `Vencido hace ${-document.days} día(s)` : document.days === 0 ? "Vence hoy" : `Vence en ${document.days} día(s)`;
  const details = document => [
    `Documento: ${document.tipo_documento || "Documento"}`,
    `Código: ${document.codigo || "Sin código"}`,
    `Vencimiento: ${document.fecha_vencimiento.slice(0, 10)} · ${deadline(document)}`,
    `Responsables / área: ${(document.responsables?.length ? document.responsables : [document.area_responsable]).filter(Boolean).join(" / ") || "Sin registrar"}`,
    `Estado registrado: ${String(document.estado || "Sin registrar").replaceAll("_", " ")}`,
    `Anticipación configurada: ${document.alertDays} días`,
  ];
  const text = [`Alertas documentarias al ${today} (America/Lima)`, `${total} documento(s) en ${groups.length} tienda(s).`, "", ...groups.flatMap(group => [`Tienda: ${group.name}`, `Encargado de tienda: ${group.manager}`, "", ...group.documents.flatMap(document => [...details(document), ""])]), "Revisa y actualiza los documentos en Asiste. Se incluyen solo los tipos de alerta elegidos."].join("\n");
  const content = groups.map(group => `<h2 style="font-size:18px;margin:26px 0 10px">${escapeHtml(group.name)}</h2><p style="font-size:14px;color:#5d5549"><strong>Encargado:</strong> ${escapeHtml(group.manager)}</p>${group.documents.map(document => `<div style="margin:14px 0"><h3 style="font-size:15px;margin:0 0 8px;color:${document.expired ? "#b53232" : "#9b6513"}">${escapeHtml(document.tipo_documento)} · ${escapeHtml(deadline(document))}</h3>${reportEmailTable(["Detalle", "Información"], details(document).slice(1).map(line => { const separator = line.indexOf(": "); return [line.slice(0, separator), line.slice(separator + 2)]; }))}</div>`).join("")}`).join("");
  const expired = groups.reduce((count, group) => count + group.documents.filter(document => document.expired).length, 0);
  const html = reportEmailLayout("Alertas de documentos", today, [
    { label: "Documentos próximos a vencer", value: total - expired, color: "#9b6513" },
    { label: "Documentos vencidos", value: expired, color: "#b53232" },
    { label: "Tiendas con alertas", value: groups.length },
  ], content, "Por vencer usa los días de anticipación configurados en cada documento e incluye el vencimiento de hoy. El estado registrado se muestra como referencia; la alerta se calcula con la fecha de vencimiento. Revisa y actualiza los documentos en Asiste.");
  return { subject: `Asiste · ${total} alerta(s) de documentos · ${today}`, text, html };
}

export async function notificationStores(db, user) {
  if (user.estado !== "activo" || !["gerencia_general", "jefe_zonal"].includes(user.rol)) return [];
  let query = db.from("tiendas").select("id,nombre,jefe:usuarios!tiendas_jefe_fk(id,nombres,apellidos,estado)").eq("estado", "activo");
  if (user.rol === "jefe_zonal") {
    const clusters = await readRows(db.from("clusters").select("id").eq("jefe_zonal_id", user.id).eq("estado", "activo").order("id"));
    if (!clusters.length) return [];
    query = query.in("cluster_id", clusters.map(cluster => cluster.id));
  }
  return readRows(query.order("id"));
}

export async function runDocumentNotifications(db, sendMail, today) {
  const settings = await readRows(db.from("notificaciones_asistencia_zonal").select("usuario_id,destinatarios,documentos_vencidos,documentos_por_vencer").eq("activo", true).or("documentos_vencidos.eq.true,documentos_por_vencer.eq.true").order("usuario_id"));
  const failures = [];
  let sent = 0;
  for (const setting of settings) {
    if (!setting.destinatarios?.length) continue;
    try {
      const { data: user, error } = await db.from("usuarios").select("id,rol,estado").eq("id", setting.usuario_id).maybeSingle();
      if (error) throw error;
      if (!user) continue;
      const stores = await notificationStores(db, user);
      if (!stores.length) continue;
      const ids = stores.map(store => store.id);
      const [documents, administrators] = await Promise.all([
        readRows(db.from("documentos_municipales").select("id,tienda_id,tipo_documento,codigo,fecha_vencimiento,dias_alerta,responsables,area_responsable,estado").in("tienda_id", ids).order("id")),
        readRows(db.from("usuarios").select("id,tienda_id,nombres,apellidos,rol,estado").in("tienda_id", ids).eq("rol", "jefe_tienda").eq("estado", "activo").order("id")),
      ]);
      const groups = documentNotificationGroups(stores, documents, administrators, setting, today);
      if (!groups.length) continue;
      // One combined digest per account and Lima date, including both selected alert types.
      const { error: claimError } = await db.from("envios_documentos_vencidos_zonal").insert({ usuario_id: user.id, fecha: today });
      if (claimError?.code === "23505") continue;
      if (claimError) throw claimError;
      try {
        const mail = documentNotificationMail(groups, today);
        await sendMail(setting, mail.subject, mail.text, [], mail.html, "documentos");
        sent++;
      } catch (sendError) {
        const { error: releaseError } = await db.from("envios_documentos_vencidos_zonal").delete().eq("usuario_id", user.id).eq("fecha", today);
        if (releaseError) throw new Error(`${sendError.message}; no se pudo liberar el envío para reintento: ${releaseError.message}`);
        throw sendError;
      }
    } catch (failure) { failures.push({ usuario_id: setting.usuario_id, error: failure.message }); }
  }
  return { procesados: settings.length, enviados: sent, failures };
}
