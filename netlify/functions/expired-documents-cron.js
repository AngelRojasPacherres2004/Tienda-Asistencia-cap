import { createClient } from "@supabase/supabase-js";
import { mailConfigured, sendAttendanceMail } from "../lib/attendance-mail.js";
import { limaDate } from "../lib/attendance-reports.js";

// 14:00 UTC = 09:00 in Lima.
export const config = { schedule: "0 14 * * *" };

export default async function expiredDocumentsCron() {
  if (!mailConfigured()) return new Response("Gmail pendiente de configuración");
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const today = limaDate();
  const { data: settings, error } = await db.from("notificaciones_asistencia_zonal").select("usuario_id,destinatarios").eq("activo", true).eq("documentos_vencidos", true);
  if (error) throw error;
  const failures = [];
  for (const setting of settings || []) {
    if (!setting.destinatarios?.length) continue;
    try {
      const { data: zonal, error: zonalError } = await db.from("usuarios").select("id").eq("id", setting.usuario_id).eq("rol", "jefe_zonal").eq("estado", "activo").maybeSingle();
      if (zonalError) throw zonalError;
      if (!zonal) continue;
      const { data: cluster, error: clusterError } = await db.from("clusters").select("id").eq("jefe_zonal_id", zonal.id).eq("estado", "activo").maybeSingle();
      if (clusterError) throw clusterError;
      if (!cluster) continue;
      const { data: stores, error: storesError } = await db.from("tiendas").select("id,nombre").eq("cluster_id", cluster.id).eq("estado", "activo");
      if (storesError) throw storesError;
      if (!stores?.length) continue;
      const names = new Map(stores.map(store => [store.id, store.nombre]));
      const { data: documents, error: docsError } = await db.from("documentos_municipales").select("tienda_id,tipo_documento,codigo,fecha_vencimiento").in("tienda_id", stores.map(store => store.id)).lt("fecha_vencimiento", today).order("fecha_vencimiento");
      if (docsError) throw docsError;
      if (!documents?.length) continue;
      const { error: claimError } = await db.from("envios_documentos_vencidos_zonal").insert({ usuario_id: zonal.id, fecha: today });
      if (claimError?.code === "23505") continue;
      if (claimError) throw claimError;
      try {
        const lines = documents.map(doc => `${names.get(doc.tienda_id)}: ${doc.tipo_documento}${doc.codigo ? ` (${doc.codigo})` : ""} · venció el ${doc.fecha_vencimiento}`);
        await sendAttendanceMail(setting, `Asiste · ${documents.length} documento(s) vencido(s) · ${today}`, [`Documentos vencidos en tus tiendas al ${today}:`, "", ...lines, "", "Consulta Asiste para revisar y renovar los documentos."].join("\n"));
      } catch (sendError) {
        await db.from("envios_documentos_vencidos_zonal").delete().eq("usuario_id", zonal.id).eq("fecha", today);
        throw sendError;
      }
    } catch (failure) { failures.push({ usuario_id: setting.usuario_id, error: failure.message }); }
  }
  if (failures.length) { console.error("Avisos de documentos vencidos:", failures); throw new Error("No se pudieron enviar algunos avisos de documentos vencidos."); }
  return new Response(JSON.stringify({ procesados: settings?.length || 0 }), { headers: { "Content-Type": "application/json" } });
}
