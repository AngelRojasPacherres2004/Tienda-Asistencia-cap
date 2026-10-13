import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import { handler } from "../netlify/functions/api.js";

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const { data: users, error } = await client.from("usuarios")
  .select("id,rol,estado").in("rol", ["gerente_comercial", "jefe_zonal", "jefe_tienda", "coach", "sistemas"])
  .eq("estado", "activo").limit(80);
if (error) throw error;
const request = async (user, route, query = {}, method = "GET", input = null) => {
  const token = jwt.sign({ id: user.id, rol: user.rol }, process.env.JWT_SECRET, { expiresIn: "5m" });
  const response = await handler({ httpMethod: method, path: `/api${route}`,
    headers: { authorization: `Bearer ${token}` }, queryStringParameters: query,
    body: input ? JSON.stringify(input) : null });
  return { status: response.statusCode, body: JSON.parse(response.body) };
};
const results = {};
for (const role of ["gerente_comercial", "jefe_zonal", "jefe_tienda", "coach"]) {
  const candidates = users.filter(user => user.rol === role);
  let found;
  for (const user of candidates) {
    const result = await request(user, "/commercial/normalized-reports");
    if (result.status === 200) { found = { user, result }; break; }
  }
  if (!found) throw new Error(`No se pudo validar el rol ${role}.`);
  assert.equal(found.result.body.ready, true);
  const catalog = found.result.body;
  if (role === "coach") assert.deepEqual(catalog.reports.map(item => item.id), ["ventas"]);
  const stores = catalog.stores.map(item => item.id);
  assert.ok(stores.length > 0);
  const report = catalog.reports.find(item => item.stores.length);
  const own = await request(found.user, "/commercial/normalized-reports/download", {
    kind: report.id, storeId: report.stores[0],
  });
  assert.equal(own.status, 200);
  assert.ok(own.body.url.includes("/storage/v1/object/sign/"));
  const download = await fetch(own.body.url, { headers: { Range: "bytes=0-60" } });
  assert.ok(download.ok);
  assert.match(download.headers.get("content-disposition") || "", /attachment/i);
  if (role !== "gerente_comercial") {
    const denied = await request(found.user, "/commercial/normalized-reports/download", {
      kind: "ventas", storeId: "T999",
    });
    assert.equal(denied.status, 403);
  }
  results[role] = { stores: stores.length, reports: catalog.reports.length, downloadStatus: download.status };
}
const systems = users.find(user => user.rol === "sistemas");
if (systems) {
  assert.equal((await request(systems, "/commercial/normalized-reports")).status, 403);
  assert.equal((await request(systems, "/systems/batches")).status, 200);
  const manager = users.find(user => user.rol === "gerente_comercial");
  assert.equal((await request(manager, "/systems/batches")).status, 403);
  const batchInput = { batchId: "123e4567-e89b-42d3-a456-426614174000", cutoff: "2026-09-30",
    source: "ventas", fileName: "VENTAS 2026.xlsx", fileSize: 1 };
  assert.equal((await request(manager, "/systems/batches/start", {}, "POST", batchInput)).status, 403);
  const start = await request(systems, "/systems/batches/start", {}, "POST", batchInput);
  assert.equal(start.status, 200);
  assert.equal(start.body.parts.length, 1);
}
console.log(JSON.stringify(results));
