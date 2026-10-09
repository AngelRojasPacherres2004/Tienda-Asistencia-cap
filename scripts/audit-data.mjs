// Read-only integration audit. No passwords, tokens or personal details are printed.
import assert from "node:assert/strict";
import { loadEnv } from "vite";
import jwt from "jsonwebtoken";
import { businessDate } from "../shared/metrics.js";
Object.assign(process.env, loadEnv("development", process.cwd(), ""));
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options = {}) => {
  const method = options.method || "GET";
  if (!["GET", "HEAD"].includes(method)) throw new Error(`Audit blocked write: ${method}`);
  return originalFetch(url, { ...options, signal: options.signal || AbortSignal.timeout(30000) });
};
const { handler } = await import("../netlify/functions/api.js");
const today = process.env.AUDIT_DATE || businessDate(), period = `desde=${today.slice(0, 7)}-01&hasta=${today}`;
const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/usuarios?select=id,rol,tienda_id,estado&estado=eq.activo&order=id`, { headers: { apikey: process.env.SUPABASE_SECRET_KEY } });
assert.equal(response.status, 200);
const people = await response.json();
let checks = 0;
const failures = [];
async function get(user, path, expected = 200) {
  const url = new URL(path, "http://audit.local");
  const token = jwt.sign(user, process.env.JWT_SECRET || "asiste-development-secret-change-me", { expiresIn: "10m" });
  const result = await handler({ httpMethod: "GET", path: `/api${url.pathname}`, headers: { authorization: `Bearer ${token}` }, queryStringParameters: Object.fromEntries(url.searchParams), body: null });
  checks++;
  if (result.statusCode !== expected) { failures.push({ role: user.rol, path: url.pathname, status: result.statusCode, error: JSON.parse(result.body).error }); return null; }
  return result.isBase64Encoded ? null : JSON.parse(result.body);
}
const roles = ["gerencia_general", "gerente_comercial", "coach", "jefe_zonal", "jefe_tienda", "asistente_tienda", "seguridad", "jefe_seguridad", "vendedor", "caja", "almacenero", "jefe_area", "asistente", "trabajador", "marketing"];
for (const role of roles) {
  const actual = people.find(row => row.rol === role);
  const user = actual || { ...people.find(row => row.rol === "vendedor"), rol: role };
  const before = failures.length;
  await get(user, "/auth/me");
  await get(user, "/perfil");
  if (["gerencia_general", "gerente_comercial", "coach", "jefe_zonal", "jefe_tienda", "asistente_tienda"].includes(role)) {
    await get(user, "/cursos");
    await get(user, "/capacitaciones/trabajadores");
    await get(user, "/encargados");
  }
  if (["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda"].includes(role)) {
    const dashboard = await get(user, `/dashboard?${period}`);
    if (dashboard) console.log(JSON.stringify({ role, attendanceRecords: dashboard.states.reduce((sum, row) => sum + row.cantidad, 0) }));
    const history = await get(user, `/asistencias/historial?${period}${role === "gerencia_general" ? "&solo_tiendas_activas=true" : ""}`);
    if (dashboard && history && role !== "gerente_comercial") {
      try { assert.equal(dashboard.states.reduce((sum, row) => sum + row.cantidad, 0), history.length); }
      catch { failures.push({ role, error: "Dashboard and history totals differ" }); }
    }
    await get(user, "/personal/resumen");
    if (role !== "gerente_comercial") await get(user, `/trafico/matriz?${period}`);
  }
  if (["gerencia_general", "gerente_comercial"].includes(role)) {
    await get(user, "/gerencia/alertas"); await get(user, "/clusters"); await get(user, "/tiendas");
  }
  if (role === "gerencia_general") {
    const comparison = await get(user, `/gerencia/comparativa?fecha=${today}&${period}`);
    const traffic = await get(user, `/trafico/matriz?${period}`);
    if (comparison && traffic) {
      try { assert.equal(comparison.tiendas.reduce((sum, row) => sum + row.visitas, 0), traffic.registros.reduce((sum, row) => sum + Number(row.cantidad), 0)); }
      catch { failures.push({ role, error: "Comparison and traffic matrix totals differ" }); }
    }
    for (const kind of ["personal", "asistencias", "documentos", "incidencias", "amonestaciones", "errores-personal", "capacitaciones", "reclamaciones", "acciones", "requerimientos", "tareas", "supervisiones"]) await get(user, `/reportes/${kind}?${period}`);
  }
  if (role === "jefe_zonal") {
    for (const module of ["asistencia", "tareas", "supervisiones", "incidencias", "personal"]) await get(user, `/zonal/${module}`);
    await get(user, `/zonal/comparativa?fecha=${today}&${period}`);
  }
  if (["jefe_tienda", "asistente_tienda", "seguridad", "jefe_seguridad"].includes(role)) {
    await get(user, "/trafico"); await get(user, "/incidencias"); await get(user, "/operaciones/resumen");
    if (["jefe_tienda", "asistente_tienda"].includes(role)) {
      await get(user, "/asistencias"); await get(user, "/documentos-alertas"); await get(user, "/usuarios"); await get(user, "/errores-personal");
    }
    if (role === "jefe_tienda") await get(user, "/mi-tienda-gestion");
  }
  if (["vendedor", "caja", "almacenero", "jefe_area", "asistente", "trabajador"].includes(role)) {
    await get(user, `/mis-asistencias?${period}`); await get(user, "/mis-capacitaciones");
    await get(user, "/gerencia/alertas", 403); await get(user, "/trafico", 403);
  }
  if (role === "marketing") { await get(user, "/marketing"); await get(user, "/marketing/attendance"); }
  console.log(JSON.stringify({ role, simulated: !actual, failures: failures.length - before }));
}
console.log(JSON.stringify({ checks, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
