// UI smoke test with temporary browser sessions. API/database writes are blocked.
import { createServer, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import jwt from "jsonwebtoken";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
Object.assign(process.env, loadEnv("development", process.cwd(), ""));
const { chromium } = await import(pathToFileURL(resolve(process.env.AUDIT_PLAYWRIGHT || "../tmp/web-audit-runtime/node_modules/playwright-core/index.mjs")));
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options = {}) => {
  if (!["GET", "HEAD"].includes(options.method || "GET")) throw new Error("UI audit blocked database write");
  return originalFetch(url, { ...options, signal: options.signal || AbortSignal.timeout(30000) });
};
const { handler } = await import("../netlify/functions/api.js");
const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/usuarios?select=id,rol,tienda_id&estado=eq.activo&order=id`, { headers: { apikey: process.env.SUPABASE_SECRET_KEY } });
if (!response.ok) throw new Error(`Roster HTTP ${response.status}`);
const people = await response.json();
const auditDir = resolve("../tmp/web-audit");
await mkdir(auditDir, { recursive: true });
const server = await createServer({ configFile: false, plugins: [react(), {
  name: "read-only-audit-api",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      if (!request.url.startsWith("/api/")) return next();
      if (request.method !== "GET") { response.statusCode = 405; response.end('{}'); return; }
      const url = new URL(request.url, "http://127.0.0.1:5185");
      const result = await handler({ httpMethod: "GET", path: url.pathname, headers: request.headers, queryStringParameters: Object.fromEntries(url.searchParams), body: null });
      response.writeHead(result.statusCode, result.headers);
      response.end(result.isBase64Encoded ? Buffer.from(result.body, "base64") : result.body);
    });
  },
}], server: { host: "127.0.0.1", port: 5185, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  const roles = (process.env.AUDIT_ROLES || "gerencia_general,gerente_comercial,coach,jefe_zonal,jefe_tienda,asistente_tienda,seguridad,jefe_seguridad,vendedor,caja,almacenero,jefe_area,asistente,trabajador,marketing").split(",");
  for (const role of roles) {
    const user = { ...(people.find(row => row.rol === role) || people.find(row => row.rol === "vendedor")), rol: role, nombres: "Auditoría", apellidos: "Local", usuario: "auditoria" };
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "America/Lima" });
    const token = jwt.sign(user, process.env.JWT_SECRET || "asiste-development-secret-change-me", { expiresIn: "15m" });
    await context.addCookies([{ name: "asiste_session", value: token, url: "http://127.0.0.1:5185", httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push({ type: "javascript", message: error.message }));
    page.on("response", response => { if (response.url().includes("/api/") && response.status() >= 400) errors.push({ type: "api", path: new URL(response.url()).pathname, status: response.status() }); });
    await page.goto("http://127.0.0.1:5185");
    await page.waitForLoadState("networkidle", { timeout: 60000 });
    const buttons = await page.locator(".sidebar nav button").allTextContents();
    for (const label of buttons) {
      const before = errors.length;
      await page.locator(".sidebar nav button").filter({ hasText: label.trim() }).first().click();
      await page.waitForLoadState("networkidle", { timeout: 60000 });
      const messages = await page.locator(".notice--error").allTextContents();
      const entry = { role, page: label.trim(), errors: errors.slice(before), notices: messages };
      results.push(entry);
      console.log(JSON.stringify(entry));
      if (role === "gerencia_general" && label.trim() === "Inicio") {
        await page.getByRole("button", { name: "Filtros", exact: true }).click();
        await page.locator(".dashboard-filter-popover select").nth(2).selectOption("09");
        await page.waitForLoadState("networkidle", { timeout: 60000 });
        await page.getByRole("button", { name: "Cerrar filtros", exact: true }).click();
        await page.locator(".general-comparison").screenshot({ path: resolve(auditDir, "gerencia-desktop.png") });
        await page.locator(".traffic-matrix-card").screenshot({ path: resolve(auditDir, "trafico-desktop.png") });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: resolve(auditDir, "gerencia-mobile.png"), fullPage: false });
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
    }
    // Home-load errors are retained even when a later navigation clears them.
    if (errors.length) results.push({ role, page: "all", errors });
    await context.close();
  }
} finally {
  await browser.close(); await server.close();
  await writeFile(resolve(auditDir, "browser-results.json"), JSON.stringify(results, null, 2));
}
const failed = results.filter(row => row.errors.length || row.notices?.length);
console.log(JSON.stringify({ pages: results.length, failed: failed.length }));
process.exitCode = failed.length ? 1 : 0;
