// Completa huecos con datos sintéticos para revisar paneles. Conserva registros existentes.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
import { addDays, businessDate, employmentPeriods, isWorkday, NORMAL_TRAFFIC_HOURS } from "../shared/metrics.js";

const env = loadEnv("development", process.cwd(), "");
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const apply = process.argv.includes("--apply");
const start = process.env.FILL_FROM || "2026-07-01";
const today = businessDate();
const end = process.env.FILL_TO && process.env.FILL_TO < today ? process.env.FILL_TO : today;
if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start > end) throw new Error("Periodo inválido");
const check = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data || [];
};
async function all(table, columns, configure = query => query) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = check(await configure(db.from(table).select(columns).order("id")).range(offset, offset + 499), table);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
async function insert(table, rows) {
  for (let offset = 0; offset < rows.length; offset += 200) {
    check(await db.from(table).insert(rows.slice(offset, offset + 200)).select("id"), `insert ${table}`);
  }
}

const stores = (await all("tiendas", "id,nombre,estado,jefe_id")).filter(row => row.estado === "activo");
const storeIds = new Set(stores.map(row => row.id));
const people = (await all("usuarios", "id,rol,estado,tienda_id,fecha_ingreso,fecha_salida,periodos_laborales!periodos_laborales_usuario_id_fkey(fecha_ingreso,fecha_salida)"))
  .filter(row => storeIds.has(row.tienda_id));
const peopleByStore = new Map(stores.map(store => [store.id, people.filter(person => person.tienda_id === store.id)]));
const attendanceExisting = await all("asistencias", "id,usuario_id,fecha", query => query.gte("fecha", start).lte("fecha", end));
const trafficExisting = await all("trafico_tienda", "id,tienda_id,fecha,rango_hora,cantidad", query => query.gte("fecha", start).lte("fecha", end));
const logExisting = await all("bitacora_tienda", "id,tienda_id,fecha", query => query.gte("fecha", start).lte("fecha", end));
const attendanceKeys = new Set(attendanceExisting.map(row => `${row.usuario_id}|${row.fecha}`));
const trafficKeys = new Set(trafficExisting.map(row => `${row.tienda_id}|${row.fecha}|${row.rango_hora}`));
const logKeys = new Set(logExisting.map(row => `${row.tienda_id}|${row.fecha}`));
const attendance = [];
const traffic = [];
const logs = [];
const now = new Date();
const limaHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hour: "2-digit", hourCycle: "h23" }).format(now));
const dates = [];
for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);

for (const store of stores) {
  const roster = peopleByStore.get(store.id);
  const registrar = roster.find(person => person.id === store.jefe_id)
    || roster.find(person => ["jefe_tienda", "asistente_tienda"].includes(person.rol))
    || roster[0];
  if (!registrar) throw new Error(`Tienda sin responsable: ${store.id}`);
  for (const date of dates) {
    if (!isWorkday(date)) continue;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const weekend = weekday === 6;
    const dayNumber = Math.floor(Date.parse(`${date}T12:00:00Z`) / 86400000);
    for (const [index, range] of NORMAL_TRAFFIC_HOURS.entries()) {
      if (date === today && 9 + index >= limaHour) continue;
      const key = `${store.id}|${date}|${range}`;
      if (trafficKeys.has(key)) continue;
      const hour = 9 + index;
      const base = 16 + (store.id * 11 % 23);
      const rhythm = hour >= 17 && hour <= 20 ? 27 : hour >= 12 && hour <= 14 ? 14 : 0;
      const variation = (store.id * 17 + dayNumber * 7 + hour * 13) % 17;
      traffic.push({ tienda_id: store.id, fecha: date, hora: `${String(hour).padStart(2, "0")}:00:00`,
        rango_hora: range, cantidad: base + rhythm + variation + (weekend ? 12 : 0), registrado_por: registrar.id });
    }
    for (const person of roster) {
      if (!employmentPeriods(person).some(period => period.fecha_ingreso <= date && (!period.fecha_salida || period.fecha_salida >= date))) continue;
      const key = `${person.id}|${date}`;
      if (attendanceKeys.has(key)) continue;
      const selector = (person.id * 19 + dayNumber * 7) % 41;
      const state = selector === 0 ? "falta" : selector <= 3 ? "tardanza" : selector === 4 ? "medio_turno" : "presente";
      attendance.push({ usuario_id: person.id, tienda_id: store.id, fecha: date, estado: state,
        hora_entrada: state === "falta" ? null : state === "tardanza" ? "09:17:00" : "08:56:00",
        hora_salida: state === "falta" ? null : state === "medio_turno" ? "13:05:00" : date === today ? null : "18:08:00",
        registrado_por: registrar.id });
    }
    if (date < today && !logKeys.has(`${store.id}|${date}`)) {
      const visits = [...trafficExisting, ...traffic].filter(row => row.tienda_id === store.id && row.fecha === date)
        .reduce((sum, row) => sum + Number(row.cantidad || 0), 0);
      logs.push({ tienda_id: store.id, fecha: date, trafico: visits,
        venta_dia: Math.round(visits * (13 + (store.id % 7)) * 100) / 100,
        categoria: "Operación diaria", evento: "Cierre de jornada", creado_por: registrar.id });
    }
  }
}

const summary = { desde: start, hasta: end, tiendas: stores.length, dias: dates.length,
  asistencias_existentes: attendanceExisting.length, asistencias_nuevas: attendance.length,
  franjas_existentes: trafficExisting.length, franjas_nuevas: traffic.length,
  cierres_existentes: logExisting.length, cierres_nuevos: logs.length };
console.log(JSON.stringify({ ...summary, aplicado: apply }));
if (apply) {
  await insert("asistencias", attendance);
  await insert("trafico_tienda", traffic);
  await insert("bitacora_tienda", logs);
  const [aCount, tCount] = await Promise.all([
    db.from("asistencias").select("id", { count: "exact", head: true }).gte("fecha", start).lte("fecha", end),
    db.from("trafico_tienda").select("id", { count: "exact", head: true }).gte("fecha", start).lte("fecha", end),
  ]);
  if (aCount.error || tCount.error || aCount.count < attendanceExisting.length + attendance.length || tCount.count < trafficExisting.length + traffic.length) throw new Error("La verificación de totales falló");
  console.log(JSON.stringify({ asistencias_verificadas: aCount.count, franjas_verificadas: tCount.count }));
}
