import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const checked = (response, label) => {
  if (response.error) throw new Error(`${label}: ${response.error.message}`);
  return response.data;
};
const store = checked(await db.from("tiendas").select("id,nombre").eq("nombre", "EMANCIPACIÓN").single(), "Tienda");
const history = [
  ["99009101", "vendedor", "2026-01-10", "2026-02-18", "Fin de contrato temporal"],
  ["99009102", "vendedor", "2026-01-22", "2026-05-14", "Renuncia voluntaria"],
  ["99009103", "caja", "2026-02-06", "2026-08-28", "Cambio de residencia"],
  ["99009104", "vendedor", "2026-03-04", "2026-05-31", "Fin de contrato temporal"],
  ["99009105", "vendedor", "2026-03-20", "2026-09-04", "Renuncia voluntaria"],
  ["99009106", "almacenero", "2026-06-08", "2026-09-11", "Fin de contrato temporal"],
  ["99009107", "vendedor", "2026-07-15", "2026-09-20", "Cambio de disponibilidad"],
].map(([dni, rol, fecha_ingreso, fecha_salida, motivo_salida], index) => ({
  nombres: "Colaborador histórico", apellidos: `Emancipación ${String(index + 1).padStart(2, "0")}`,
  dni, rol, fecha_ingreso, fecha_salida, motivo_salida, estado: "inactivo", tienda_id: store.id,
  usuario: null, password: null,
}));
const existing = checked(await db.from("usuarios").select("id,dni,tienda_id,rol,estado,fecha_ingreso,fecha_salida")
  .in("dni", history.map((person) => person.dni)), "Usuarios existentes");
for (const row of existing) {
  const expected = history.find((person) => person.dni === row.dni);
  if (row.tienda_id !== store.id || row.rol !== expected.rol || row.estado !== "inactivo" ||
      row.fecha_ingreso !== expected.fecha_ingreso || row.fecha_salida !== expected.fecha_salida) {
    throw new Error(`El documento reservado ${row.dni} ya pertenece a otro registro; no se hará ningún cambio.`);
  }
}
const activeResult = await db.from("usuarios").select("id", { count: "exact", head: true })
  .eq("tienda_id", store.id).eq("estado", "activo");
if (activeResult.error) throw activeResult.error;
const activeBefore = activeResult.count;
console.log(`${history.length - existing.length} perfiles históricos por insertar; ${existing.length} ya existentes. Dotación activa: ${activeBefore}.`);
if (!apply) {
  console.log("Vista previa. Usa --apply para insertar.");
  process.exit(0);
}
for (const person of history) {
  let user = existing.find((row) => row.dni === person.dni);
  if (!user) user = checked(await db.from("usuarios").insert(person).select("id,dni").single(), "Insertar perfil histórico");
  const period = checked(await db.from("periodos_laborales").select("id,fecha_ingreso,fecha_salida")
    .eq("usuario_id", user.id).eq("fecha_ingreso", person.fecha_ingreso).maybeSingle(), "Periodo laboral");
  if (period && period.fecha_salida !== person.fecha_salida) throw new Error(`Periodo inconsistente para ${person.dni}.`);
  if (!period) checked(await db.from("periodos_laborales").insert({ usuario_id: user.id,
    fecha_ingreso: person.fecha_ingreso, fecha_salida: person.fecha_salida, motivo_salida: person.motivo_salida }).select("id").single(), "Insertar periodo laboral");
}
const current = checked(await db.from("usuarios").select("id,estado,rol,fecha_ingreso,fecha_salida")
  .eq("tienda_id", store.id), "Verificación de personal");
const active = current.filter((person) => person.estado === "activo").length;
const endOfSeptember = current.filter((person) => person.fecha_ingreso <= "2026-09-30" &&
  (!person.fecha_salida || person.fecha_salida > "2026-09-30")).length;
if (active !== activeBefore || active !== endOfSeptember) throw new Error(`No cuadra el cierre de septiembre: ${endOfSeptember} frente a ${activeBefore} activos iniciales y ${active} actuales.`);
console.log(`Verificado: ${active} activos y ${endOfSeptember} al cierre de septiembre; ${history.length} ingresos y ${history.length} salidas históricas.`);
