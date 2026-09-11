import { createClient } from "@supabase/supabase-js";
import { limaNow, sendAttendanceEmail } from "./lib/attendance-email.js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function deliver(log, schedule, reportDate) {
  try {
    const report = await sendAttendanceEmail(supabase, schedule, reportDate);
    await supabase.from("notificaciones_asistencia_envios").update({
      estado: "enviado",
      asistentes: report.attended,
      ausentes: report.absent,
      error: null,
      fecha_envio: new Date().toISOString(),
    }).eq("id", log.id);
  } catch (error) {
    await supabase.from("notificaciones_asistencia_envios").update({
      estado: log.intentos >= 3 ? "requiere_revision" : "error",
      error: String(error.message || error).slice(0, 1000),
    }).eq("id", log.id);
  }
}

export async function handler() {
  const now = limaNow();
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  await supabase.from("notificaciones_asistencia_envios").update({
    estado: "requiere_revision",
    error: "El proceso quedó interrumpido y el resultado del envío es incierto.",
  }).eq("estado", "procesando").lt("fecha_creacion", staleBefore);
  const [{ data: schedules, error }, { data: retries }] = await Promise.all([
    supabase.from("notificaciones_asistencia").select("*").eq("activo", true).is("eliminado_at", null),
    supabase.from("notificaciones_asistencia_envios").select("*,programacion:notificaciones_asistencia(*)").eq("fecha_reporte", now.date).eq("tipo", "automatico").eq("estado", "error").lt("intentos", 3).order("fecha_creacion").limit(3),
  ]);
  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  let processed = 0;
  for (const retry of retries || []) {
    if (processed >= 3 || !retry.programacion || retry.programacion.eliminado_at) continue;
    const { data: claimed } = await supabase.from("notificaciones_asistencia_envios")
      .update({ estado: "procesando", intentos: retry.intentos + 1 })
      .eq("id", retry.id).eq("estado", "error").eq("intentos", retry.intentos).select().maybeSingle();
    if (claimed) {
      await deliver(claimed, retry.programacion, now.date);
      processed += 1;
    }
  }
  for (const schedule of schedules || []) {
    if (processed >= 3 || String(schedule.hora).slice(0, 5) !== now.time) continue;
    const { data: log, error: claimError } = await supabase.from("notificaciones_asistencia_envios").insert({
      programacion_id: schedule.id,
      fecha_reporte: now.date,
      tipo: "automatico",
      estado: "procesando",
      destinatarios: schedule.destinatarios,
    }).select().single();
    if (!claimError && log) {
      await deliver(log, schedule, now.date);
      processed += 1;
    }
  }
  return { statusCode: 200, body: JSON.stringify({ processed, lima: now }) };
}
