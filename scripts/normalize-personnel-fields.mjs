import { createClient } from "@supabase/supabase-js";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizedPersonnelFields } from "../shared/personnelNormalization.js";

const expectedHost = "xtnihjzqnxozbotymoma.supabase.co";
if (!process.env.SUPABASE_URL || new URL(process.env.SUPABASE_URL).host !== expectedHost || !process.env.SUPABASE_SECRET_KEY) {
  throw new Error("La base configurada no es bd-app o faltan credenciales.");
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await supabase.from("usuarios").select("id,distrito,nacionalidad,carrera").range(0, 999);
if (error) throw error;
const changes = (data || []).map(person => ({ before: person, after: normalizedPersonnelFields(person) }))
  .filter(({ before, after }) => ["distrito", "nacionalidad", "carrera"].some(key => (before[key] || null) !== after[key]));
const groups = new Map();
for (const { before, after } of changes) {
  const changed = Object.fromEntries(["distrito", "nacionalidad", "carrera"]
    .filter(key => (before[key] || null) !== after[key]).map(key => [key, after[key]]));
  const key = JSON.stringify(changed);
  if (!groups.has(key)) groups.set(key, { changed, ids: [] });
  groups.get(key).ids.push(before.id);
}
console.log(JSON.stringify({ scanned: data?.length || 0, peopleToNormalize: changes.length,
  fields: Object.fromEntries(["distrito", "nacionalidad", "carrera"].map(key => [key,
    changes.filter(({ before, after }) => (before[key] || null) !== after[key]).length])) }));
if (process.argv.includes("--apply") && changes.length) {
const backupDirectory = await mkdtemp(join(tmpdir(), "asiste-personnel-normalization-"));
const backupFile = join(backupDirectory, "before.json");
await writeFile(backupFile, JSON.stringify(changes.map(({ before }) => before), null, 2));
console.log(`Copia previa local: ${backupFile}`);
for (const { changed, ids } of groups.values()) {
  const result = await supabase.from("usuarios").update(changed).in("id", ids).select("id");
  if (result.error || result.data?.length !== ids.length) throw new Error(`Actualización incompleta; revisa la copia previa. ${result.error?.message || "Filas no coinciden"}`);
}
const { data: verify, error: verifyError } = await supabase.from("usuarios").select("id,distrito,nacionalidad,carrera").in("id", changes.map(({ before }) => before.id));
if (verifyError) throw verifyError;
const wrong = (verify || []).filter(row => {
  const expected = changes.find(({ before }) => before.id === row.id)?.after;
  return ["distrito", "nacionalidad", "carrera"].some(key => (row[key] || null) !== expected[key]);
});
if (wrong.length) throw new Error(`${wrong.length} filas no coinciden tras la normalización.`);
console.log(`Normalización verificada: ${verify.length} personas.`);
}
