// Publicación privada, aditiva e inmutable. Sin --apply solo valida y estima.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { ANNUAL_DETAIL_COLUMNS, annualReportPath, annualSummaryPath, annualMonthlyReportPath, annualMonthlySummaryPath } from "../shared/annualReports.js";

const directory = process.argv.find(value => value.startsWith("--directory="))?.slice(12);
const apply = process.argv.includes("--apply");
if (!directory || !process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  throw new Error("Indica --directory=RUTA y las credenciales de servicio en el entorno.");
}
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const { data: release, error: releaseError } = await client.from("dashboard_releases")
  .select("id,version,sales_cutoff,stock_cutoff").eq("status", "published")
  .order("published_at", { ascending: false }).limit(1).single();
if (releaseError || !release) throw new Error("No se encontró un corte comercial publicado.");
const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
const monthly = manifest.schemaVersion === 2;
if (manifest.cutoffs?.ventas !== release.sales_cutoff || manifest.cutoffs?.stock !== release.stock_cutoff) {
  throw new Error("La Capa 2 no coincide con el corte publicado; no se mezclarán fuentes.");
}
if (!Array.isArray(manifest.files) || !Array.isArray(manifest.summaries) || !Array.isArray(manifest.years)) {
  throw new Error("Catálogo anual incompleto.");
}
const { data: mapping, error: mappingError } = await client.from("commercial_store_map")
  .select("dashboard_store_id");
if (mappingError) throw new Error("No se pudo validar el alcance de tiendas.");
const allowed = new Set(mapping.map(item => item.dashboard_store_id));
const files = [];
for (const item of manifest.files.filter(row => allowed.has(row.storeId))) {
  if (!ANNUAL_DETAIL_COLUMNS[item.kind]
    || !manifest.years.includes(item.year) || !Number.isSafeInteger(item.rows) || item.rows < 1
    || item.path !== (monthly ? `${item.year}/${item.kind}/${item.storeId}/${String(item.month).padStart(2, "0")}.jsonl.gz`
      : `${item.year}/${item.kind}/${item.storeId}.jsonl.gz`)) throw new Error("Detalle anual inválido.");
  const filePath = path.join(directory, item.path);
  const size = (await stat(filePath)).size;
  if (size !== item.bytes || size > 50 * 1024 * 1024) throw new Error(`Archivo inválido o demasiado grande: ${item.path}`);
  files.push({ ...item, filePath, storagePath: monthly
    ? annualMonthlyReportPath(release.version, item.year, item.kind, item.storeId, item.month)
    : annualReportPath(release.version, item.year, item.kind, item.storeId) });
}
for (const item of manifest.summaries.filter(row => allowed.has(row.storeId))) {
  if (!manifest.years.includes(item.year)
    || !Number.isSafeInteger(item.rows) || item.rows < 1
    || item.path !== `${item.year}/summary/${item.storeId}.json.gz`) throw new Error("Resumen anual inválido.");
  const filePath = path.join(directory, item.path);
  const size = (await stat(filePath)).size;
  if (size !== item.bytes || size > 50 * 1024 * 1024) throw new Error(`Archivo inválido o demasiado grande: ${item.path}`);
  files.push({ ...item, filePath, storagePath: monthly
    ? annualMonthlySummaryPath(release.version, item.year, item.storeId)
    : annualSummaryPath(release.version, item.year, item.storeId) });
}
console.log(JSON.stringify({ version: release.version, years: manifest.years,
  objects: files.length, compressedBytes: files.reduce((sum, item) => sum + item.bytes, 0), apply }));
if (!apply) process.exit(0);
const bucket = client.storage.from("dashboard-data");
const manifestPath = `${monthly ? "commercial-annual-v2" : "commercial-annual"}/${release.version}/manifest.json`;
if ((await bucket.info(manifestPath)).data) throw new Error("La versión anual ya está publicada.");
for (const file of files) {
  const existing = await bucket.info(file.storagePath);
  if (existing.data) {
    if (Number(existing.data.size) !== file.bytes) throw new Error(`Conflicto en ${file.storagePath}`);
    continue;
  }
  const { error } = await bucket.upload(file.storagePath, await readFile(file.filePath),
    { contentType: "application/octet-stream", upsert: false });
  if (error) throw new Error(`No se pudo publicar ${file.storagePath}: ${error.message}`);
}
const published = { ...manifest, releaseId: release.id, version: release.version,
  files: manifest.files.filter(row => allowed.has(row.storeId)),
  summaries: manifest.summaries.filter(row => allowed.has(row.storeId)),
  stores: Object.fromEntries(Object.entries(manifest.stores).filter(([id]) => allowed.has(id))),
  dimensions: Object.fromEntries(Object.entries(manifest.dimensions).filter(([key]) => allowed.has(key.split("/")[1]))),
  publishedAt: new Date().toISOString() };
const { error } = await bucket.upload(manifestPath, Buffer.from(JSON.stringify(published)),
  { contentType: "application/json", upsert: false });
if (error) throw new Error(`Archivos publicados sin catálogo: ${error.message}`);
console.log("Reportes anuales publicados.");
