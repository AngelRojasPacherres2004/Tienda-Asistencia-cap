import { createClient } from "@supabase/supabase-js";
import { mailConfigured } from "../lib/attendance-mail.js";
import { limaDate, nextReportRun, sendScheduledReport } from "../lib/attendance-reports.js";

export const config = { schedule: "* * * * *" };

export default async function attendanceReportsCron() {
  if (!mailConfigured()) return new Response("Gmail pendiente de configuración", { status: 200 });
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date();
  // Lotes pequeños y concurrentes para respetar el tiempo de las funciones programadas.
  const { data, error } = await db.from("programaciones_asistencia_zonal").select("*").eq("activo", true).lte("proximo_envio", now.toISOString()).order("proximo_envio").limit(3);
  if (error) throw error;
  const results = await Promise.allSettled(data.map(async schedule => {
    const result = await sendScheduledReport(db, schedule, limaDate(new Date(schedule.proximo_envio)), "automatico");
    const { error: updateError } = await db.from("programaciones_asistencia_zonal").update({ proximo_envio: nextReportRun(schedule.hora, new Date()), updated_at: new Date().toISOString() }).eq("id", schedule.id).eq("proximo_envio", schedule.proximo_envio);
    if (updateError) throw updateError;
    return result;
  }));
  if (results.some(result => result.status === "rejected")) throw new Error("No se pudo procesar una programación de asistencia. Revisa las tablas y el historial.");
  return new Response(JSON.stringify({ procesados: data.length }), { headers: { "Content-Type": "application/json" } });
}
