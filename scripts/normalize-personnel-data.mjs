import { createClient } from "@supabase/supabase-js";
import { normalizeLaborArea } from "../src/lib/laborAreas.js";
import { normalizeDepartureReason } from "../src/lib/personnelCatalogs.js";

const project = process.argv.find((arg) => arg.startsWith("--project="))?.slice(10);
const apply = process.argv.includes("--apply");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!project || !url || !key || new URL(url).hostname !== `${project}.supabase.co`) {
  throw new Error("Indica --project=<ref> y verifica que .env apunta exactamente a ese proyecto.");
}

const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const fields = [
  ["usuarios", "area_laboral", normalizeLaborArea],
  ["usuarios", "motivo_salida", normalizeDepartureReason],
  ["periodos_laborales", "motivo_salida", normalizeDepartureReason],
];

async function allRows(table, column) {
  const rows = [];
  for (let offset = 0;; offset += 500) {
    const { data, error } = await client.from(table).select(`id,${column}`).order("id").range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

for (const [table, column, normalize] of fields) {
  const rows = await allRows(table, column);
  const groups = new Map();
  for (const row of rows) {
    const oldValue = row[column];
    if (!oldValue) continue;
    const newValue = normalize(oldValue);
    if (!newValue || newValue === oldValue) continue;
    const key = JSON.stringify([oldValue, newValue]);
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  console.log(`${table}.${column}: ${rows.length} filas, ${[...groups.values()].reduce((a, b) => a + b, 0)} equivalencias verificadas`);
  for (const [pair, count] of groups) {
    const [oldValue, newValue] = JSON.parse(pair);
    console.log(`  ${JSON.stringify(oldValue)} → ${JSON.stringify(newValue)} (${count})`);
    if (!apply) continue;
    const { data, error } = await client.from(table).update({ [column]: newValue }).eq(column, oldValue).select("id");
    if (error) throw error;
    if (data.length !== count) throw new Error(`La actualización de ${table}.${column} cambió ${data.length} filas; se esperaban ${count}. Revisa concurrencia.`);
  }
  if (apply) {
    const remaining = (await allRows(table, column)).filter((row) => row[column] && normalize(row[column]) !== row[column]);
    if (remaining.length) throw new Error(`${table}.${column}: quedan ${remaining.length} valores sin homologar.`);
  }
}

console.log(apply ? "Homologación verificada." : "Simulación; usa --apply para actualizar las equivalencias anteriores.");
