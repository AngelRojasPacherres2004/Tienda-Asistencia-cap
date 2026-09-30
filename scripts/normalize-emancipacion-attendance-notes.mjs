import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const notes = {
  presente: "Asistencia registrada.",
  tardanza: "Ingreso posterior a la hora prevista.",
  medio_turno: "Medio turno registrado.",
  apoyo: "Apoyo registrado en la jornada.",
  falta: "Ausencia registrada; motivo no indicado.",
  permiso: "Permiso registrado; detalle no indicado.",
  descanso_medico: "Descanso médico registrado; detalle no indicado.",
};
const store = await db.from("tiendas").select("id,nombre").eq("nombre", "EMANCIPACIÓN").single();
if (store.error) throw store.error;
const query = await db.from("asistencias").select("id,estado,observaciones")
  .eq("tienda_id", store.data.id).like("observaciones", "[DEMO EMANCIPACIÓN 2026]%").limit(1000);
if (query.error) throw query.error;
const rows = query.data || [];
if (rows.length === 1000) throw new Error("El límite de consulta impide verificar el alcance completo.");
if (rows.some((row) => !notes[row.estado])) throw new Error("Hay un estado de asistencia no previsto.");
console.log(`${rows.length} observaciones etiquetadas en EMANCIPACIÓN.`);
if (!apply) {
  console.log("Vista previa. Usa --apply para reemplazarlas por descripciones neutras.");
  process.exit(0);
}
for (const [estado, observaciones] of Object.entries(notes)) {
  const ids = rows.filter((row) => row.estado === estado).map((row) => row.id);
  for (let offset = 0; offset < ids.length; offset += 100) {
    const group = ids.slice(offset, offset + 100);
    const updated = await db.from("asistencias").update({ observaciones })
      .eq("tienda_id", store.data.id).in("id", group).like("observaciones", "[DEMO EMANCIPACIÓN 2026]%")
      .select("id");
    if (updated.error) throw updated.error;
    if (updated.data.length !== group.length) throw new Error(`Se esperaban ${group.length} actualizaciones de ${estado}; hubo ${updated.data.length}.`);
  }
}
const remaining = await db.from("asistencias").select("id", { count: "exact", head: true })
  .eq("tienda_id", store.data.id).like("observaciones", "[DEMO EMANCIPACIÓN 2026]%");
if (remaining.error) throw remaining.error;
if (remaining.count) throw new Error(`Quedan ${remaining.count} observaciones etiquetadas.`);
console.log(`${rows.length} observaciones actualizadas y verificadas.`);
