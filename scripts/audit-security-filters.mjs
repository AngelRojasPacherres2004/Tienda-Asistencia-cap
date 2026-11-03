import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import jwt from "jsonwebtoken";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

Object.assign(process.env, loadEnv("development", process.cwd(), ""));
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const origin = process.env.AUDIT_ORIGIN || "http://127.0.0.1:5180";
const output = join(process.env.LOCALAPPDATA || process.cwd(), "DashBoardGeneral", "audits", "security-filters");
await mkdir(output, { recursive: true });
const { data: accounts, error: accountError } = await db.from("usuarios")
  .select("id,rol,tienda_id,estado,cambio_credenciales_pendiente")
  .in("rol", ["seguridad", "jefe_seguridad"]).eq("estado", "activo");
assert.ifError(accountError);
const results = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const role of ["seguridad", "jefe_seguridad"]) {
    const account = accounts.find(row => row.rol === role && row.tienda_id && !row.cambio_credenciales_pendiente);
    if (!account) continue;
    const { data: traffic, error: trafficError } = await db.from("trafico_tienda")
      .select("fecha").eq("tienda_id", account.tienda_id).order("fecha", { ascending: false }).limit(1);
    assert.ifError(trafficError);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "America/Lima" });
    const token = jwt.sign(account, process.env.JWT_SECRET, { expiresIn: "10m" });
    await context.addCookies([{ name: "asiste_session", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    const nav = page.locator(".sidebar nav");
    await nav.getByText("Tráfico", { exact: true }).waitFor();
    assert.equal(await nav.getByText("Inicio", { exact: true }).count(), 0);
    const trafficHistory = page.locator(".security-history");
    const trafficDate = trafficHistory.locator('input[type="date"]');
    await trafficDate.waitFor();
    assert.equal(await trafficHistory.locator("input,select").count(), 1);
    if (traffic.length) {
      await trafficDate.fill(traffic[0].fecha);
      await trafficHistory.locator(".security-table__row--traffic").first().waitFor({ timeout: 30_000 });
      assert.equal(await trafficDate.inputValue(), traffic[0].fecha);
      await trafficDate.fill("2020-01-01");
      await trafficHistory.getByText("Sin registros").waitFor({ timeout: 30_000 });
      await trafficDate.fill(traffic[0].fecha);
      await trafficHistory.locator(".security-table__row--traffic").first().waitFor({ timeout: 30_000 });
    }
    await trafficHistory.screenshot({ path: join(output, `${role}-traffic.png`), animations: "disabled" });
    await nav.getByText("Incidencias", { exact: true }).click();
    const incidentHistory = page.locator(".security-history");
    const incidentDate = incidentHistory.locator('input[type="date"]');
    await incidentDate.waitFor();
    assert.equal(await incidentHistory.locator('input[type="month"]').count(), 0);
    assert.equal(await incidentHistory.locator("select").count(), 3);
    assert.equal(await incidentHistory.getByText("Todas las severidades").count(), 0);
    if (traffic.length) {
      await incidentDate.fill("2020-01-01");
      await incidentHistory.getByText("Sin incidencias").waitFor({ timeout: 30_000 });
      await incidentDate.fill(traffic[0].fecha);
      assert.equal(await incidentDate.inputValue(), traffic[0].fecha);
    }
    await incidentHistory.screenshot({ path: join(output, `${role}-incidents.png`), animations: "disabled" });
    assert.deepEqual(pageErrors, []);
    results.push({ role, nav: "ok", trafficDate: "ok", incidentFilters: "ok" });
    await context.close();
  }
} finally { await browser.close(); }
assert.ok(results.length, "No hay cuentas de seguridad disponibles para auditoría.");
console.log(JSON.stringify(results));
