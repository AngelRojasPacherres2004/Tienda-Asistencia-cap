import { createClient } from "@supabase/supabase-js";

const project = process.argv.find(arg => arg.startsWith("--project="))?.slice(10);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!project || !url || !key || new URL(url).hostname !== `${project}.supabase.co`) {
  throw new Error("Indica --project=<ref> y verifica que .env apunta exactamente a ese proyecto.");
}

const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const tables = {
  usuarios: ["rol", "estado", "sexo", "estado_civil", "regimen_jornada", "tipo_turno", "area_laboral", "motivo_salida"],
  tiendas: ["estado", "formato"],
  clusters: ["estado", "codigo", "nombre"],
};

for (const [table, fields] of Object.entries(tables)) {
  const rows = [];
  for (let offset = 0;; offset += 500) {
    const { data, error } = await client.from(table).select(`id,${fields.join(",")}`).order("id").range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) break;
  }
  console.log(`${table}: ${rows.length} filas`);
  for (const field of fields) {
    const counts = new Map();
    for (const row of rows) {
      const value = String(row[field] ?? "<vacío>").trim() || "<vacío>";
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    console.log(`  ${field}: ${[...counts].sort((a, b) => b[1] - a[1]).map(([value, count]) => `${JSON.stringify(value)}=${count}`).join("; ")}`);
  }
}
