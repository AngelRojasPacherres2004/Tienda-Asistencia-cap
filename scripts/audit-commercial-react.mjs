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
const output = process.env.AUDIT_OUTPUT || join(process.env.LOCALAPPDATA || process.cwd(), "DashBoardGeneral", "audits", "react-final");
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
      page.on("pageerror", error => errors.push(error.stack || error.message));
      if (process.env.AUDIT_INTERACTIONS === "1") page.on("response", response => {
        if (response.url().includes("/commercial/company-ranking")) console.log(JSON.stringify({ role, width, rankingStatus: response.status() }));
      });
      try {
        await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.locator('[data-react-commercial-shell="true"]').waitFor({ timeout: 45_000 });
        const pages = [
          { button: 0, selector: ".page-one", markers: [".primary-kpis", ".meta-vs-real canvas", ".price-range-card canvas"] },
          { button: 1, selector: ".page-two", markers: [".rotation-card canvas", ".size-distribution-card canvas", ".predictive-v2 .health-card", ".predictive-replenishment-card"] },
          role === 'jefe_tienda'
            ? { button: 2, selector: '.store-dashboard-shell', markers: ['.sales-forecast-panel', '.traffic-matrix-card', '.attendance-matrix-panel', '.training-development'] }
            : { button: 2, selector: ".talent-page", markers: [".talent-kpis", ".seller-performance-card canvas", ".training-card canvas"] },
        ];
        for (const panel of pages) {
          if (process.env.AUDIT_PAGE && panel.button + 1 !== Number(process.env.AUDIT_PAGE)) continue;
          if (panel.button) await page.locator(".page-tabs button").nth(panel.button).click();
          const section = page.locator(`${panel.selector}:visible`);
          await section.waitFor({ timeout: 60_000 });
          for (const marker of panel.markers) await section.locator(`${marker}:visible`).first().waitFor({ timeout: 60_000 });
          if (role === 'jefe_tienda' && panel.button === 2) {
            await section.locator('.sales-forecast-loading').waitFor({ state: 'hidden', timeout: 60_000 });
            await section.getByRole('heading', { name: 'Amonestaciones y asistencia del mes' }).waitFor();
            const headings = await section.getByRole('heading').allTextContents();
            const position = pattern => headings.findIndex(text => pattern.test(text));
            assert.ok(position(/Venta esperada/) < position(/Tráfico de/));
            assert.ok(position(/Tráfico de/) < position(/Asistencia y movimientos/));
            assert.ok(position(/Rotación de Personal/) < position(/Amonestaciones y asistencia/));
            assert.ok(position(/Errores por Usuario/) < position(/^Capacitación y desarrollo$/));
            await section.getByRole('heading', { name: 'OPERACIÓN Y EQUIPO', exact: true }).scrollIntoViewIfNeeded();
            await page.screenshot({ path: join(output, `${role}-${width}-operations.png`), animations: 'disabled' });
          }
          const card = section.locator(".card:visible, .panel:visible").first();
          await card.scrollIntoViewIfNeeded();
          await card.screenshot({ path: join(output, `${role}-${width}-${panel.button}.png`), animations: "disabled" });
          if (process.env.AUDIT_INTERACTIONS === "1" && role === "jefe_tienda" && panel.button === 0) {
            console.log(JSON.stringify({ role, width, rankingLabels: await page.locator(".ranking-store-count").allInnerTexts() }));
            await page.locator(".ranking-store-count:visible").filter({ hasText: /^(?:[2-9]|[1-9][0-9]+) TIENDAS/ }).waitFor({ timeout: 30_000 });
          }
          if (process.env.AUDIT_INTERACTIONS === "1" && role === "gerente_comercial" && width === 1440 && panel.button === 0) {
            for (const [label, moduleId] of [
              ["VENTA × M²", "saleM2-modal"],
              ["VENTA × COLAB", "saleCollaborator-modal"],
              ["MARKUP", "markup-modal"],
              ["SELL-THROUGH", "sellThrough-modal"],
            ]) {
              await section.locator('[data-react-commercial-module="key-kpis"] article').filter({ hasText: label }).click();
              const modal = page.locator(`[data-react-commercial-module="${moduleId}"]:visible`);
              await modal.waitFor({ timeout: 30_000 });
              if (moduleId === "saleCollaborator-modal") await modal.locator(".kpi-seller-detail tfoot").waitFor({ timeout: 60_000 });
              await modal.screenshot({ path: join(output, `${moduleId}.png`), animations: "disabled" });
              await modal.getByRole("button", { name: /Cerrar detalle del indicador/ }).click();
            }
          }
          if (process.env.AUDIT_INTERACTIONS === "1" && role === "gerente_comercial" && width === 1440 && panel.button === 1) {
            const sizes = section.locator(".size-distribution-card:visible");
            await sizes.getByText("Venta: 90 días", { exact: false }).waitFor();
            let skuCount = 0;
            for (let attempt = 0; attempt < 60; attempt++) {
              skuCount = Number((await sizes.locator(".size-chart-summary strong").first().innerText()).replace(/[^0-9]/g, ""));
              if (skuCount > 0) break;
              await page.waitForTimeout(500);
            }
            assert.ok(skuCount > 0, "La venta por talla no cargó SKU del rubro para el corte seleccionado");
            await sizes.screenshot({ path: join(output, "size-sales-90d.png"), animations: "disabled" });
            const canvas = sizes.locator("canvas").first();
            const bounds = await canvas.boundingBox();
            assert.ok(bounds, "No se dibujó el gráfico de tallas");
            const detail = page.locator('[data-react-commercial-module="size-detail-modal"]:visible');
            for (const [x, y] of [[0.58, 0.5], [0.55, 0.6], [0.62, 0.4]]) {
              await canvas.click({ position: { x: bounds.width * x, y: bounds.height * y } });
              if (await detail.isVisible()) break;
            }
            await detail.waitFor({ timeout: 10_000 });
            await detail.locator("tbody tr").first().waitFor({ timeout: 30_000 });
            await detail.screenshot({ path: join(output, "size-sales-detail.png"), animations: "disabled" });
            await detail.getByRole("button", { name: "Cerrar detalle por talla" }).click();
            await page.getByRole("button", { name: "Abrir filtros y listas" }).click();
            const monthFilter = page.locator(".filter-panel .filter-field").first();
            await monthFilter.locator("summary").click();
            await monthFilter.getByRole("button", { name: "SEP", exact: true }).click();
            await sizes.getByText("Venta: 90 días hasta Sep 2026", { exact: false }).waitFor({ timeout: 30_000 });
            await sizes.locator(".size-chart-summary strong").first().waitFor({ timeout: 60_000 });
            await page.locator(".filter-panel label").filter({ hasText: "AÑO" }).locator("select").selectOption("2025");
            await sizes.getByText("Venta: 90 días hasta Sep 2025", { exact: false }).waitFor({ timeout: 30_000 });
            await sizes.locator(".size-chart-summary strong").first().waitFor({ timeout: 60_000 });
            await page.getByRole("button", { name: "Abrir filtros y listas" }).click();
          }
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
        if (role === 'jefe_tienda') {
          assert.equal(await page.getByRole('button', { name: 'Incidencias', exact: true }).count(), 0);
          assert.match(await page.locator('.page-tabs button').nth(2).innerText(), /OPERACIÓN Y EQUIPO/);
          for (const [path, method] of [['/api/incidencias','GET'], ['/api/incidencias','POST'], ['/api/incidencias/export.xlsx','GET']]) {
            const denied = await handler({ httpMethod: method, path, headers: { authorization: `Bearer ${token}` }, queryStringParameters: {}, body: '{}' });
            assert.equal(denied.statusCode, 403, `${method} ${path}: debe estar bloqueado para el administrador`);
          }
          if (width < 1100) await page.locator('.mobile-topbar button').first().click();
          await page.getByRole('button', { name: 'Resumen', exact: true }).click();
          const summary = page.locator('.store-dashboard-shell');
          await summary.locator('.store-dashboard-personnel-kpis').waitFor();
          assert.doesNotMatch(await summary.innerText(), /Incidencias|Venta esperada|Rotación de Personal|Capacitación y desarrollo/);
          assert.equal(await summary.locator('.traffic-matrix-card,.attendance-matrix-panel,.training-development').count(), 0);
        }
        assert.deepEqual(errors, [], `${role}/${width}: errores de navegador`);
        results.push({ role, width, pages: process.env.AUDIT_PAGE ? [Number(process.env.AUDIT_PAGE)] : [1, 2, 3], assistant: "ok" });
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
