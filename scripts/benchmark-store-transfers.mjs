// Read-only timing probe for the commercial transfer endpoint and its store scope.
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { loadEnv } from "vite";

Object.assign(process.env, loadEnv("development", process.cwd(), ""));
const headers = { apikey: process.env.SUPABASE_SECRET_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` };
const base = `${process.env.SUPABASE_URL}/rest/v1`;
const [usersResponse, scopesResponse, storesResponse] = await Promise.all([
  fetch(`${base}/usuarios?select=id,rol,tienda_id,estado,cambio_credenciales_pendiente&rol=eq.jefe_tienda&estado=eq.activo&limit=300`, { headers }),
  fetch(`${base}/commercial_user_scopes?select=usuario_id,scope_type,scope_value&scope_type=eq.store`, { headers }),
  fetch(`${base}/commercial_store_map?select=dashboard_store_id,tienda_id`, { headers }),
]);
assert.equal(usersResponse.status, 200);
assert.equal(scopesResponse.status, 200);
assert.equal(storesResponse.status, 200);
const users = await usersResponse.json();
const scopes = new Map((await scopesResponse.json()).map(row => [row.usuario_id, row.scope_value]));
const stores = new Map((await storesResponse.json()).map(row => [Number(row.tienda_id), row.dashboard_store_id]));
const { handler } = await import("../netlify/functions/api.js");
for (const user of users.filter(row => !row.cambio_credenciales_pendiente
  && scopes.get(row.id) === stores.get(Number(row.tienda_id)))) {
  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "10m" });
  const start = performance.now();
  const result = process.env.BENCH_HTTP === "1"
    ? await (async () => { const response = await fetch(`${process.env.BENCH_ORIGIN || 'http://127.0.0.1:8788'}/api/commercial/store-transfers`, {
      headers: { cookie: `asiste_session=${token}` }, signal: AbortSignal.timeout(60_000),
    }); if (process.env.BENCH_TRACE === '1') console.log(JSON.stringify({ status: response.status,
      type: response.headers.get('content-type'), length: response.headers.get('content-length') }));
      if (process.env.BENCH_TRACE === '1') {
        const chunks = [];
        let received = 0;
        for await (const chunk of response.body) { chunks.push(chunk); received += chunk.length;
          if (received > 0 && received % 262144 < chunk.length) console.log(JSON.stringify({ received })); }
        return { statusCode: response.status, body: Buffer.concat(chunks).toString('utf8') };
      }
      return { statusCode: response.status, body: await response.text() }; })()
    : await handler({ httpMethod: "GET", path: "/api/commercial/store-transfers",
      headers: { authorization: `Bearer ${token}` }, queryStringParameters: {}, body: null });
  const seconds = Number(((performance.now() - start) / 1000).toFixed(2));
  if (result.statusCode === 403) continue;
  const payload = JSON.parse(result.body || "{}");
  console.log(JSON.stringify({ status: result.statusCode, seconds, bytes: Buffer.byteLength(result.body || ""), scope: scopes.get(user.id),
    routes: payload.routes?.length ?? null, products: payload.products?.length ?? null,
    error: result.statusCode >= 400 ? payload.error : undefined }));
  break;
}
