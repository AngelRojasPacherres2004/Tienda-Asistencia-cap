// Retira exclusivamente las filas de domingo identificables de la carga del 5 de octubre.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
import { addDays, isWorkday } from "../shared/metrics.js";

const env = loadEnv("development", process.cwd(), "");
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const apply = process.argv.includes("--apply");
const sundays = [];
for (let date = "2026-09-01"; date <= "2026-10-05"; date = addDays(date, 1)) if (!isWorkday(date)) sundays.push(date);
async function all(table, columns) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const response = await db.from(table).select(columns).in("fecha", sundays).order("id").range(offset, offset + 499);
    if (response.error) throw new Error(`${table}: ${response.error.message}`);
    rows.push(...response.data);
    if (response.data.length < 500) return rows;
  }
}
const [attendance, traffic, logs] = await Promise.all([
  all("asistencias", "id,usuario_id,fecha,estado,hora_entrada,hora_salida,observaciones,created_at"),
  all("trafico_tienda", "id,tienda_id,fecha,rango_hora,cantidad,observaciones,updated_at"),
  all("bitacora_tienda", "id,tienda_id,fecha,trafico,venta_dia,categoria,evento,created_at"),
]);
const attendanceIds = attendance.filter(row =>
  row.created_at?.startsWith("2026-10-05T15:18:") && !row.observaciones &&
  ["presente", "tardanza", "medio_turno", "falta"].includes(row.estado) &&
  (row.estado === "falta" ? !row.hora_entrada && !row.hora_salida
    : row.estado === "tardanza" ? row.hora_entrada === "09:17:00"
      : row.hora_entrada === "08:56:00"),
).map(row => row.id);
const trafficIds = traffic.filter(row => {
  const hour = Number(row.rango_hora?.slice(0, 2));
  const dayNumber = Math.floor(Date.parse(`${row.fecha}T12:00:00Z`) / 86400000);
  const expected = 16 + (row.tienda_id * 11 % 23) +
    (hour >= 17 && hour <= 20 ? 27 : hour >= 12 && hour <= 14 ? 14 : 0) +
    (row.tienda_id * 17 + dayNumber * 7 + hour * 13) % 17 + 12;
  return row.updated_at?.startsWith("2026-10-05T10:1") && !row.observaciones &&
    hour >= 9 && hour <= 21 && Number(row.cantidad) === expected;
}).map(row => row.id);
const logIds = logs.filter(row =>
  row.created_at?.startsWith("2026-10-05T15:22:") || row.created_at?.startsWith("2026-10-05T15:23:"),
).filter(row => row.categoria === "Operación diaria" && row.evento === "Cierre de jornada" &&
  Number(row.venta_dia) === Number(row.trafico) * (13 + row.tienda_id % 7)).map(row => row.id);
console.log(JSON.stringify({ domingos: sundays, existentes: { asistencias: attendance.length, trafico: traffic.length, cierres: logs.length },
  retirar: { asistencias: attendanceIds.length, trafico: trafficIds.length, cierres: logIds.length }, aplicado: apply }));
if (apply) {
  for (const [table, ids] of [["asistencias", attendanceIds], ["trafico_tienda", trafficIds], ["bitacora_tienda", logIds]]) {
    for (let offset = 0; offset < ids.length; offset += 100) {
      const response = await db.from(table).delete().in("id", ids.slice(offset, offset + 100));
      if (response.error) throw new Error(`Retirar ${table}: ${response.error.message}`);
    }
  }
  console.log(JSON.stringify({ retirados: { asistencias: attendanceIds.length, trafico: trafficIds.length, cierres: logIds.length } }));
}
