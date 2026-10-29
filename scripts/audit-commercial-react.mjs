import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import jwt from "jsonwebtoken";
import { chromium } from "playwright-core";
import { loadEnv } from "vite";

Object.assign(process.env, loadEnv("development", process.cwd(), ""));
const { handler } = await import("../netlify/functions/api.js");
const origin = process.env.AUDIT_ORIGIN || "http://127.0.0.1:5180";
const headers = { apikey: process.env.SUPABASE_SECRET_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` };
const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/usuarios?select=id,rol,tienda_id,estado,cambio_credenciales_pendiente&rol=in.(gerente_comercial,jefe_zonal,jefe_tienda)&estado=eq.activo&limit=300`, { headers });
assert.equal(response.status, 200, "No se pudieron leer las cuentas de auditoría");
const users = await response.json();
const [scopesResponse, storesResponse] = await Promise.all([
  fetch(`${process.env.SUPABASE_URL}/rest/v1/commercial_user_scopes?select=usuario_id,scope_type,scope_value&scope_type=eq.store`, { headers }),
  fetch(`${process.env.SUPABASE_URL}/rest/v1/commercial_store_map?select=dashboard_store_id,tienda_id`, { headers }),
]);
assert.equal(scopesResponse.status, 200);
assert.equal(storesResponse.status, 200);
const scopes = new Map((await scopesResponse.json()).map(row => [row.usuario_id, row.scope_value]));
const stores = new Map((await storesResponse.json()).map(row => [Number(row.tienda_id), row.dashboard_store_id]));
let chief;
for (const candidate of users.filter(row => row.rol === "jefe_tienda" && !row.cambio_credenciales_pendiente
  && scopes.get(row.id) === stores.get(Number(row.tienda_id)))) {
  const token = jwt.sign(candidate, process.env.JWT_SECRET, { expiresIn: "10m" });
  const result = await handler({ httpMethod: "GET", path: "/api/commercial/access",
    headers: { authorization: `Bearer ${token}` }, queryStringParameters: {}, body: null });
  if (result.statusCode === 200) { chief = candidate; break; }
}
assert.ok(chief, "No hay jefe de tienda con acceso comercial vigente");
const output = join(process.env.LOCALAPPDATA || process.cwd(), "DashBoardGeneral", "audits", "react-final");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  for (const role of ["gerente_comercial", "jefe_zonal", "jefe_tienda"]) {
    if (process.env.AUDIT_ROLE && process.env.AUDIT_ROLE !== role) continue;
    const user = role === "jefe_tienda" ? chief
      : users.find(row => row.rol === role && !row.cambio_credenciales_pendiente);
    assert.ok(user, `Falta una cuenta activa de ${role}`);
    for (const width of [1440, 820]) {
      if (process.env.AUDIT_WIDTH && Number(process.env.AUDIT_WIDTH) !== width) continue;
      const context = await browser.newContext({ viewport: { width, height: 950 }, timezoneId: "America/Lima" });
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "10m" });
      await context.addCookies([{ name: "asiste_session", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.locator('[data-react-commercial-shell="true"]').waitFor({ timeout: 45_000 });
        const pages = [
          { button: 0, selector: ".page-one", markers: [".primary-kpis", ".meta-vs-real canvas", ".price-range-card canvas"] },
          { button: 1, selector: ".page-two", markers: [".rotation-card canvas", ".size-distribution-card canvas", ".predictive-v2 .health-card", ".predictive-replenishment-card"] },
          { button: 2, selector: ".talent-page", markers: [".talent-kpis", ".seller-performance-card canvas", ".training-card canvas"] },
        ];
        for (const panel of pages) {
          if (panel.button) await page.locator(".page-tabs button").nth(panel.button).click();
          const section = page.locator(`${panel.selector}:visible`);
          await section.waitFor({ timeout: 60_000 });
          for (const marker of panel.markers) await section.locator(`${marker}:visible`).first().waitFor({ timeout: 60_000 });
          const card = section.locator(".card:visible").first();
          await card.scrollIntoViewIfNeeded();
          await card.screenshot({ path: join(output, `${role}-${width}-${panel.button}.png`), animations: "disabled" });
          if (process.env.AUDIT_CAPTURE_ALL === "1") {
            const cards = section.locator(".card:visible");
            for (let index = 0; index < await cards.count(); index++) {
              const current = cards.nth(index);
              await current.scrollIntoViewIfNeeded();
              await current.screenshot({ path: join(output, `${role}-${width}-${panel.button}-section-${index}.png`), animations: "disabled" });
            }
          }
          console.log(JSON.stringify({ role, width, page: panel.button + 1, status: "ok" }));
        }
        await page.locator(".assistant-launcher:visible").click();
        await page.locator(".assistant-panel:visible").waitFor();
        await page.locator('.assistant-panel:visible').getByRole("button", { name: "Cerrar asistente" }).click();
        assert.deepEqual(errors, [], `${role}/${width}: errores de navegador`);
        results.push({ role, width, pages: 3, assistant: "ok" });
      } catch (error) {
        console.error(JSON.stringify({ role, width, browserErrors: errors,
          body: (await page.locator("body").innerText()).slice(0, 700) }));
        throw error;
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(results));
