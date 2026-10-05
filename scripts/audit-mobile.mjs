// Read-only visual audit of every role at phone widths.
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
  if (!["GET", "HEAD"].includes(options.method || "GET")) throw new Error("Mobile audit blocked database write");
  return originalFetch(url, { ...options, signal: options.signal || AbortSignal.timeout(30000) });
};
const { handler } = await import("../netlify/functions/api.js");
const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/usuarios?select=id,rol,tienda_id&estado=eq.activo&order=id`, { headers: { apikey: process.env.SUPABASE_SECRET_KEY } });
if (!response.ok) throw new Error(`Roster HTTP ${response.status}`);
const people = await response.json();
const auditDir = resolve("../tmp/mobile-audit");
await mkdir(auditDir, { recursive: true });
const server = await createServer({ configFile: false, plugins: [react(), {
  name: "read-only-mobile-api",
  configureServer(app) {
    app.middlewares.use(async (request, response, next) => {
      if (!request.url.startsWith("/api/")) return next();
      if (request.method !== "GET") { response.statusCode = 405; response.end("{}"); return; }
      const url = new URL(request.url, "http://127.0.0.1:5185");
      const result = await handler({ httpMethod: "GET", path: url.pathname, headers: request.headers, queryStringParameters: Object.fromEntries(url.searchParams), body: null });
      response.writeHead(result.statusCode, result.headers);
      response.end(result.body);
    });
  },
}], server: { host: "127.0.0.1", port: 5185, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  const roles = (process.env.AUDIT_ROLES || "gerencia_general,gerente_comercial,coach,jefe_zonal,jefe_tienda,asistente_tienda,seguridad,jefe_seguridad,vendedor,caja,almacenero,jefe_area,asistente,trabajador,marketing").split(",");
  const widths = (process.env.AUDIT_WIDTHS || "390,320").split(",").map(Number);
  for (const width of widths) for (const role of roles) {
    const user = { ...(people.find(row => row.rol === role) || people.find(row => row.rol === "vendedor")), rol: role, nombres: "Auditoría", apellidos: "Local", usuario: "auditoria" };
    const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: "America/Lima" });
    const token = jwt.sign(user, process.env.JWT_SECRET || "asiste-development-secret-change-me", { expiresIn: "30m" });
    await context.addCookies([{ name: "asiste_session", value: token, url: "http://127.0.0.1:5185", httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:5185", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 60000 });
    const labels = await page.locator(".sidebar nav button").allTextContents();
    for (const label of labels) {
      if (!await page.locator(".sidebar").evaluate(node => node.classList.contains("sidebar--open")))
        await page.locator(".mobile-topbar button").first().click();
      await page.locator(".sidebar nav button").filter({ hasText: label.trim() }).first().click();
      await page.waitForLoadState("networkidle", { timeout: 60000 });
      if (await page.locator(".sidebar").evaluate(node => node.classList.contains("sidebar--open")))
        await page.locator(".sidebar-mobile-close").click();
      await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 0);
      const measure = await page.evaluate(() => ({ notices: [...document.querySelectorAll(".notice--error")].map(node => node.textContent.trim()),
        matrix: Boolean(document.querySelector(".attendance-matrix-scroll")),
        horizontalScroll: (() => { scrollTo(10000, 0); const value = scrollX; scrollTo(0, 0); return value; })(),
        offenders: [...document.querySelectorAll("body *")].filter(node => {
          const box = node.getBoundingClientRect();
          return box.width > 0 && box.right > innerWidth + 2 && getComputedStyle(node).position !== "fixed";
        }).slice(0, 8).map(node => `${node.tagName.toLowerCase()}.${String(node.className || "").replaceAll(" ", ".").slice(0, 50)}<${String(node.parentElement?.className || "").slice(0, 50)}`) }));
      const entry = { width, role, page: label.trim(), horizontalScroll: measure.horizontalScroll,
        notices: measure.notices, jsErrors: [...errors], matrix: measure.matrix,
        ...(measure.horizontalScroll > 2 ? { offenders: measure.offenders } : {}) };
      results.push(entry);
      console.log(JSON.stringify(entry));
      if (width === 390 && ["gerencia_general", "jefe_zonal", "jefe_tienda", "seguridad", "marketing"].includes(role) && labels.indexOf(label) === 0)
        await page.screenshot({ path: resolve(auditDir, `${role}-home.png`), fullPage: false });
      if (width === 320 && role === "gerente_comercial" && labels.indexOf(label) === 0)
        await page.locator(".training-development").screenshot({ path: resolve(auditDir, "gerente_comercial-training-320.png") });
      if (width === 390 && measure.matrix && ["gerencia_general", "jefe_tienda"].includes(role))
        await page.locator(".attendance-overview, .attendance-matrix-panel").first().screenshot({ path: resolve(auditDir, `${role}-matrix.png`) });
      if (process.env.AUDIT_EXPAND === "1" && measure.matrix && labels.indexOf(label) === 0) {
        const panel = page.locator(".attendance-overview, .attendance-matrix-panel").first();
        await panel.getByRole("button", { name: "Ampliar matriz" }).click();
        const box = await panel.boundingBox();
        console.log(JSON.stringify({ width, role, expandedMatrix: box }));
        await panel.screenshot({ path: resolve(auditDir, `${role}-expanded-${width}.png`) });
        await panel.getByRole("button", { name: "Cerrar vista ampliada" }).click();
      }
      if (process.env.AUDIT_FIRST_ONLY === "1") break;
    }
    await context.close();
  }
} finally {
  await browser.close(); await server.close();
  await writeFile(resolve(auditDir, "results.json"), JSON.stringify(results, null, 2));
}
const failed = results.filter(row => row.horizontalScroll > 2 || row.notices.length || row.jsErrors.length);
console.log(JSON.stringify({ pages: results.length, failed: failed.length }));
process.exitCode = failed.length ? 1 : 0;
