// Read-only route audit for domain extraction. Never prints credentials or rows.
import assert from "node:assert/strict";
import { loadEnv } from "vite";
import jwt from "jsonwebtoken";

Object.assign(process.env, loadEnv("development", process.cwd(), ""));
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options = {}) => {
  const method = options.method || "GET";
  if (!["GET", "HEAD"].includes(method)) throw new Error(`Read-only audit blocked ${method}`);
  return originalFetch(url, { ...options, signal: options.signal || AbortSignal.timeout(30000) });
};

const { handler } = await import("../netlify/functions/api.js");
const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/usuarios?select=id,rol,tienda_id,estado&estado=eq.activo&rol=in.(gerente_comercial,administrador_seguridad)`, {
  headers: { apikey: process.env.SUPABASE_SECRET_KEY },
});
assert.equal(response.status, 200);
const users = await response.json();
const cases = [
  ["gerente_comercial", "/commercial/access"],
  ["gerente_comercial", "/commercial/manifest"],
  ["gerente_comercial", "/commercial-goals?year=2026"],
  ["gerente_comercial", "/commercial/annual-reports"],
  ["gerente_comercial", "/commercial/normalized-reports"],
  ["administrador_seguridad", "/seguridad-central?tipo=personal&page=1"],
];
for (const [role, path] of cases) {
  const user = users.find(row => row.rol === role);
  assert.ok(user, `No active ${role} account for audit`);
  const url = new URL(path, "http://audit.local");
  const token = jwt.sign(user, process.env.JWT_SECRET || "asiste-development-secret-change-me", { expiresIn: "10m" });
  const result = await handler({
    httpMethod: "GET", path: `/api${url.pathname}`,
    headers: { authorization: `Bearer ${token}` },
    queryStringParameters: Object.fromEntries(url.searchParams), body: null,
  });
  const bytes = Buffer.byteLength(result.body || "", "utf8");
  console.log(JSON.stringify({ role, path: url.pathname, status: result.statusCode, bytes }));
  assert.equal(result.statusCode, 200, `${role} ${url.pathname}`);
}
