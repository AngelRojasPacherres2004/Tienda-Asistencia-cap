import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const result = (response, label) => {
  if (response.error) throw new Error(`${label}: ${response.error.message}`);
  return response.data || [];
};
const stores = result(await db.from("tiendas").select("id,nombre,jefe_id").ilike("nombre", "EMANCIPACI%"), "Tienda");
if (stores.length !== 1 || stores[0].nombre !== "EMANCIPACIÓN") throw new Error("No se identificó EMANCIPACIÓN de forma unívoca.");
const store = stores[0];
const people = result(await db.from("usuarios").select("id,estado,fecha_ingreso,fecha_salida").eq("tienda_id", store.id).order("id"), "Personal")
  .filter((person) => person.estado === "activo" && !person.fecha_salida);
if (!people.some((person) => person.id === store.jefe_id)) throw new Error("Administrador no disponible.");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const lastDay = today.startsWith("2026-09-") ? Number(today.slice(8, 10)) : today > "2026-09-30" ? 30 : 0;
if (!lastDay) throw new Error("Septiembre de 2026 aún no ha comenzado.");
const existing = result(await db.from("asistencias").select("usuario_id,fecha").eq("tienda_id", store.id).gte("fecha", "2026-09-01").lte("fecha", `2026-09-${String(lastDay).padStart(2, "0")}`), "Asistencias existentes");
const existingKeys = new Set(existing.map((row) => `${row.usuario_id}|${row.fecha}`));
const states = ["presente", "presente", "presente", "presente", "presente", "presente", "presente", "tardanza", "medio_turno", "apoyo", "permiso", "falta", "descanso_medico"];
const rows = [];
for (let day = 1; day <= lastDay; day++) {
  const fecha = `2026-09-${String(day).padStart(2, "0")}`;
  const isSunday = new Date(`${fecha}T12:00:00Z`).getUTCDay() === 0;
  const scheduled = people.filter((person, index) => person.fecha_ingreso <= fecha && (!isSunday || index === 0 || (index + Math.floor(day / 7)) % 4 === 0));
  for (const [index, person] of scheduled.entries()) {
    if (existingKeys.has(`${person.id}|${fecha}`)) continue;
    const estado = states[(day * 7 + index * 11) % states.length];
    const works = ["presente", "tardanza", "medio_turno", "apoyo"].includes(estado);
    rows.push({ tienda_id: store.id, usuario_id: person.id, fecha, estado,
      hora_entrada: works ? (estado === "tardanza" ? "09:17:00" : "09:00:00") : null,
      hora_salida: works ? (estado === "medio_turno" ? "13:00:00" : "18:00:00") : null,
      observaciones: { presente: "Asistencia registrada.", tardanza: "Ingreso posterior a la hora prevista.", medio_turno: "Medio turno registrado.", apoyo: "Apoyo registrado en la jornada.", falta: "Ausencia registrada; motivo no indicado.", permiso: "Permiso registrado; detalle no indicado.", descanso_medico: "Descanso médico registrado; detalle no indicado." }[estado],
      registrado_por: store.jefe_id });
  }
}
const distribution = Object.fromEntries([...new Set(rows.map((row) => row.estado))].map((estado) => [estado, rows.filter((row) => row.estado === estado).length]));
console.log(JSON.stringify({ tienda: store.nombre, hasta: `2026-09-${String(lastDay).padStart(2, "0")}`, existentes: existing.length, nuevas: rows.length, estados: distribution }, null, 2));
if (apply) {
  for (let offset = 0; offset < rows.length; offset += 100) result(await db.from("asistencias").insert(rows.slice(offset, offset + 100)).select("id"), "Insertar asistencias");
  const verification = result(await db.from("asistencias").select("usuario_id,fecha").eq("tienda_id", store.id).gte("fecha", "2026-09-01").lte("fecha", `2026-09-${String(lastDay).padStart(2, "0")}`), "Verificación");
  const keys = new Set(verification.map((row) => `${row.usuario_id}|${row.fecha}`));
  if (rows.some((row) => !keys.has(`${row.usuario_id}|${row.fecha}`))) throw new Error("Faltan marcas en la verificación.");
  console.log(`Verificado: ${verification.length} marcas de septiembre en EMANCIPACIÓN.`);
} else console.log("Vista previa. Usa --apply para insertar.");
