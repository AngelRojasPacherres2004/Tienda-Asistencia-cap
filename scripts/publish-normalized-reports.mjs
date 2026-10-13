import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { normalizedReportPath } from "../shared/normalizedReports.js";

const directory = process.argv.find(value => value.startsWith("--directory="))?.slice(12);
const apply = process.argv.includes("--apply");
if (!directory || !process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  throw new Error("Usa --directory=RUTA con SUPABASE_URL y SUPABASE_SECRET_KEY configurados.");
}
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const { data: release, error: releaseError } = await client.from("dashboard_releases")
  .select("id,version,sales_cutoff,stock_cutoff").eq("status", "published")
  .order("published_at", { ascending: false }).limit(1).single();
if (releaseError || !release) throw new Error("No se encontró una publicación comercial vigente.");
const [summary, { data: mapping, error: mapError }, { data: stores, error: storeError }] = await Promise.all([
  readFile(path.join(directory, "summary.json"), "utf8").then(JSON.parse),
  client.from("commercial_store_map").select("dashboard_store_id,tienda_id"),
  client.from("tiendas").select("id,nombre"),
]);
if (mapError || storeError) throw new Error("No se pudo validar el mapeo de tiendas.");
if (summary.salesCutoff !== release.sales_cutoff || summary.stockCutoff !== release.stock_cutoff) {
  throw new Error("Capa 2 y la publicación vigente tienen cortes distintos. No se mezclarán reportes.");
}
const allowedStores = new Set(mapping.map(item => item.dashboard_store_id));
const storeNames = Object.fromEntries(mapping.map(item => [item.dashboard_store_id,
  stores.find(store => Number(store.id) === Number(item.tienda_id))?.nombre || item.dashboard_store_id]));
const files = [];
for (const item of summary.files) {
  if (!allowedStores.has(item.storeId) || !Number.isSafeInteger(item.rows) || item.rows < 1) {
    throw new Error("El resumen contiene una tienda o cantidad de filas inválida.");
  }
  const filePath = path.join(directory, item.kind, `${item.storeId}.csv`);
  if ((await stat(filePath)).size !== item.bytes || item.bytes > 5 * 1024 * 1024) {
    throw new Error(`El archivo ${item.kind}/${item.storeId} no coincide o supera el límite por objeto.`);
  }
  files.push({ ...item, path: normalizedReportPath(release.version, item.kind, item.storeId), filePath });
}
const totalBytes = files.reduce((sum, item) => sum + item.bytes, 0);
console.log(JSON.stringify({ release: release.version, files: files.length,
  rows: files.reduce((sum, item) => sum + item.rows, 0), bytes: totalBytes, apply }));
if (!apply) process.exit(0);

const bucket = client.storage.from("dashboard-data");
const manifestPath = `commercial-reports/${release.version}/manifest.json`;
const existingManifest = await bucket.info(manifestPath);
if (existingManifest.data) throw new Error("Los reportes de esta versión ya están publicados.");
for (const item of files) {
  const existing = await bucket.info(item.path);
  if (existing.data) {
    if (Number(existing.data.size) !== item.bytes) throw new Error(`Conflicto de tamaño en ${item.path}.`);
    continue;
  }
  const { error } = await bucket.upload(item.path, await readFile(item.filePath), {
    contentType: "application/octet-stream", upsert: false,
  });
  if (error) throw new Error(`No se pudo publicar ${item.path}: ${error.message}`);
}
const manifest = { releaseId: release.id, version: release.version,
  salesCutoff: release.sales_cutoff, stockCutoff: release.stock_cutoff, storeNames,
  files: files.map(({ filePath, ...item }) => item), publishedAt: new Date().toISOString() };
const { error: manifestError } = await bucket.upload(manifestPath, Buffer.from(JSON.stringify(manifest)), {
  contentType: "application/json", upsert: false,
});
if (manifestError) throw new Error(`Los CSV llegaron, pero el catálogo no se pudo publicar: ${manifestError.message}`);
console.log(`Reportes publicados para ${release.version}.`);
