// Read-only visual parity check for the first Angular-to-React commercial chart.
import assert from "node:assert/strict";
import { loadEnv } from "vite";
import jwt from "jsonwebtoken";
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

Object.assign(process.env, loadEnv("development", process.cwd(), ""));
const origin = process.env.AUDIT_ORIGIN || "http://127.0.0.1:5180";
const chartId = process.env.AUDIT_CHART_ID || "growth";
assert.ok(["growth", "meta-vs-real", "hourly-performance", "category-participation", "price-range", "store-ranking", "brand-sales", "gender-donut", "gender-bar", "inventory-rotation", "inventory-capacity", "inventory-store-value", "inventory-sizes", "inventory-antiquity", "talent-history", "talent-team-productivity", "talent-seller-performance", "talent-area-distribution", "talent-store-productivity", "talent-training", "talent-exit", "talent-incidents", "predictive-health", "predictive-replenishment", "predictive-projection", "modal-ticket", "modal-conversion", "modal-traffic", "page-tabs", "header", "filters", "primary-kpis", "key-kpis", "progress", "talent-kpis", "size-controls", "talent-capacity", "stock-matrix", "birthday-modal", "growth-card", "meta-vs-real-card", "hourly-card", "talent-history-card", "talent-team-card", "talent-area-card", "talent-store-card", "talent-exit-card", "talent-incidents-card", "talent-training-card", "size-card", "store-value-card", "category-card", "brand-card", "ranking-card", "gender-card", "price-range-card", "rotation-card", "antiquity-card", "health-card", "projection-card", "replenishment-card", "seller-card", "ticket-modal", "conversion-modal", "traffic-modal", "stock-origin-modal", "transfer-modal", "predictive-parameters", "section-heading", "commercial-access", "assistant-widget", "talent-page", "commercial-page", "inventory-page", "all-modules"].includes(chartId), "Panel de prueba no válido.");
const rankingMarkupOnly = chartId === "store-ranking" && process.env.AUDIT_RANKING_VIEW === "MARKUP";
const rankingFallback = chartId === "store-ranking" && process.env.AUDIT_RANKING_FALLBACK === "1";
const expandedBrand = chartId === "brand-sales" && process.env.AUDIT_EXPANDED === "1";
const expandedInventoryValue = chartId === "inventory-store-value" && process.env.AUDIT_EXPANDED === "1";
const genderTextil = chartId === "gender-donut" && process.env.AUDIT_GENDER_RUBRO === "TEXTIL";
const sizeRubro = chartId === "inventory-sizes" ? process.env.AUDIT_SIZE_RUBRO || "CALZADO" : "";
const sizeMetric = chartId === "inventory-sizes" ? process.env.AUDIT_SIZE_METRIC || "SALES" : "";
const sizeSystem = chartId === "inventory-sizes" ? process.env.AUDIT_SIZE_SYSTEM || "USA" : "";
assert.ok(!sizeRubro || ["CALZADO", "TEXTIL"].includes(sizeRubro));
assert.ok(!sizeMetric || ["SALES", "STOCK", "TRANSFERS"].includes(sizeMetric));
assert.ok(!sizeSystem || ["USA", "EUR"].includes(sizeSystem));
const sizeSuffix = chartId === "inventory-sizes" ? [sizeRubro === "TEXTIL" && "textil", sizeMetric !== "SALES" && sizeMetric.toLowerCase(), sizeSystem === "EUR" && "eur"].filter(Boolean).join("-") : "";
const captureSuffix = rankingFallback ? "-fallback" : rankingMarkupOnly ? "-markup"
  : expandedBrand || expandedInventoryValue ? "-expanded" : genderTextil ? "-textil" : sizeSuffix ? `-${sizeSuffix}` : "";
const headers = { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` };
const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/usuarios?select=id,rol,tienda_id,estado,cambio_credenciales_pendiente&rol=in.(gerente_comercial,jefe_zonal,jefe_tienda)&estado=eq.activo&limit=300`, {
  headers,
});
assert.equal(response.status, 200);
const people = await response.json();
const [scopesResponse, storesResponse] = await Promise.all([
  fetch(`${process.env.SUPABASE_URL}/rest/v1/commercial_user_scopes?select=usuario_id,scope_type,scope_value&scope_type=eq.store`, { headers }),
  fetch(`${process.env.SUPABASE_URL}/rest/v1/commercial_store_map?select=dashboard_store_id,tienda_id`, { headers }),
]);
assert.equal(scopesResponse.status, 200);
assert.equal(storesResponse.status, 200);
const scopes = new Map((await scopesResponse.json()).map(row => [row.usuario_id, row.scope_value]));
const storeMap = new Map((await storesResponse.json()).map(row => [Number(row.tienda_id), row.dashboard_store_id]));
const { handler } = await import("../netlify/functions/api.js");
let chief;
for (const candidate of people.filter(row => row.rol === "jefe_tienda" && !row.cambio_credenciales_pendiente
  && scopes.get(row.id) === storeMap.get(Number(row.tienda_id)))) {
  const token = jwt.sign(candidate, process.env.JWT_SECRET, { expiresIn: "10m" });
  const result = await handler({ httpMethod: "GET", path: "/api/commercial/access",
    headers: { authorization: `Bearer ${token}` }, queryStringParameters: {}, body: null });
  if (result.statusCode === 200) { chief = candidate; break; }
}
assert.ok(chief, "No hay jefe de tienda con alcance comercial vigente para la prueba.");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const output = join(process.env.LOCALAPPDATA || process.cwd(), "DashBoardGeneral", "audits");
await mkdir(output, { recursive: true });
const scenarios = [
  { role: "gerente_comercial", width: 1440, year: "2026" },
  { role: "gerente_comercial", width: 820, year: "2025" },
  { role: "jefe_zonal", width: 1440, year: "2026" },
  { role: "jefe_zonal", width: 820, year: "2025" },
  { role: "jefe_tienda", width: 1440, year: "2026" },
  { role: "jefe_tienda", width: 820, year: "2025" },
].filter(scenario => !process.env.AUDIT_ROLE || scenario.role === process.env.AUDIT_ROLE)
  .filter(scenario => !process.env.AUDIT_WIDTH || scenario.width === Number(process.env.AUDIT_WIDTH))
  .slice(0, Number(process.env.AUDIT_SCENARIO_LIMIT || 6));
const results = [];
try {
  for (const scenario of scenarios) {
    const user = scenario.role === "jefe_tienda" ? chief
      : people.find(row => row.rol === scenario.role && !row.cambio_credenciales_pendiente);
    assert.ok(user, `No hay cuenta activa de ${scenario.role} para la prueba.`);
    let delayedGoalsBody;
    if (chartId === "meta-vs-real" && process.env.AUDIT_LOADING_STATE === "1") {
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "10m" });
      const result = await handler({ httpMethod: "GET", path: "/api/commercial/store-goals",
        headers: { authorization: `Bearer ${token}` }, queryStringParameters: {}, body: null });
      assert.equal(result.statusCode, 200, `No se pudieron preparar las metas de ${scenario.role}`);
      delayedGoalsBody = result.body;
    }
    const pair = [];
    for (const [mode, query] of [["angular", "?reactModule=angular"], ["react", ["page-tabs", "header", "filters", "primary-kpis", "key-kpis", "progress", "talent-kpis", "size-controls", "talent-capacity", "stock-matrix", "birthday-modal", "growth-card", "meta-vs-real-card", "hourly-card", "talent-history-card", "talent-team-card", "talent-area-card", "talent-store-card", "talent-exit-card", "talent-incidents-card", "talent-training-card", "size-card", "store-value-card", "category-card", "brand-card", "ranking-card", "gender-card", "price-range-card", "rotation-card", "antiquity-card", "health-card", "projection-card", "replenishment-card", "seller-card", "ticket-modal", "conversion-modal", "traffic-modal", "stock-origin-modal", "transfer-modal", "predictive-parameters", "section-heading", "commercial-access", "assistant-widget", "talent-page", "commercial-page", "inventory-page"].includes(chartId) ? `?reactModule=${chartId}` : `?reactChart=${chartId}`]]) {
    console.log(JSON.stringify({ checking: scenario, mode }));
    const context = await browser.newContext({ viewport: { width: scenario.width, height: 950 }, timezoneId: "America/Lima" });
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "10m" });
    await context.addCookies([{ name: "asiste_session", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    const failures = [];
    const goalEvents = [];
    page.on("pageerror", error => failures.push(error.message));
    page.on("response", item => {
      const path = new URL(item.url()).pathname;
      const optionalFallbackFile = item.status() === 404 && (
        (["antiquity-card", "health-card", "projection-card", "replenishment-card", "stock-origin-modal", "predictive-parameters", "section-heading", "assistant-widget", "talent-page", "commercial-page", "inventory-page", "all-modules"].includes(chartId)
          && /\/api\/commercial\/files\/dashboard-(?:price-range(?:-(?:summary|compact))?-\d{4}|stock-hierarchy|stock-sizes-calzado)\.json$/.test(path))
        || (["talent-page", "commercial-page", "inventory-page", "all-modules"].includes(chartId) && /\/api\/commercial\/files\/dashboard-sellers-(?:summary|compact)-\d{4}\.json$/.test(path)));
      if (item.url().includes("/api/") && item.status() >= 400 && !optionalFallbackFile
        && !(chartId === "commercial-access" && path === "/api/commercial/access" && item.status() === 403)) failures.push(`API ${item.status()}: ${path}`);
      if (item.url().includes("/api/commercial/store-goals")) goalEvents.push(item.status());
    });
    await page.route("**/api/**", route => {
      const request = route.request();
      const readOnlyPost = request.method() === "POST" && (
        ["inventory-sizes", "size-controls", "stock-matrix", "size-card", "store-value-card", "transfer-modal", "section-heading", "inventory-page", "all-modules"].includes(chartId) && ["/api/commercial/product-codes", "/api/commercial/stock-insights"].includes(new URL(request.url()).pathname)
        || (chartId.startsWith("predictive-") || ["health-card", "projection-card", "replenishment-card"].includes(chartId)) && new URL(request.url()).pathname === "/api/commercial/stock-insights"
      );
      if (request.method() !== "GET" && !readOnlyPost) return route.abort();
      return route.continue();
    });
    if (rankingFallback) await page.route("**/api/commercial/company-ranking", route => route.abort());
    if (chartId === "commercial-access") await page.route("**/api/commercial/access", route => route.fulfill({
      status: 403, contentType: "application/json", body: JSON.stringify({ error: "Acceso no autorizado" }),
    }));
    let releaseGoals;
    if (delayedGoalsBody) {
      const gate = new Promise(resolve => { releaseGoals = resolve; });
      await page.route("**/api/commercial/store-goals", async route => {
        await gate;
        if (!page.isClosed()) await route.fulfill({ status: 200, contentType: "application/json", body: delayedGoalsBody });
      });
    }
    try {
      const goalsRequest = chartId === "meta-vs-real"
        ? page.waitForResponse(item => item.url().includes("/api/commercial/store-goals"), { timeout: 90_000 })
        : null;
      const shellQuery = mode === "react" && process.env.AUDIT_REACT_SHELL === "1"
        ? "?reactShell=react" : chartId === "all-modules" && mode === "react" ? "" : query;
      await page.goto(`${origin}/${shellQuery}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      if (mode === "react" && process.env.AUDIT_REACT_SHELL === "1") {
        await page.locator('[data-react-commercial-shell="true"]').waitFor({ timeout: 30_000 });
        assert.equal(await page.locator('dashboard-react-module').count(), 0, "React montó una vista Angular");
      }
      if (chartId === "all-modules") {
        const panels = [
          { index: 0, page: ".page-one", selectors: [".primary-kpis", ".kpi-strip", ".category-card", ".section-heading"] },
          { index: 1, page: ".page-two", selectors: [".size-distribution-card", ".predictive-parameters", ".health-card", ".section-heading"] },
          { index: 2, page: ".talent-page", selectors: [".talent-kpis", ".seller-performance-card", ".training-card", ".section-heading"] },
        ];
        for (const target of panels) {
          if (target.index) await page.locator(".page-tabs button").nth(target.index).click();
          await page.locator(`${target.page}:visible`).waitFor({ timeout: 30_000 });
          for (const selector of target.selectors) {
            const element = page.locator(`${target.page} ${selector}:visible`).first();
            await element.waitFor({ timeout: 60_000 });
            assert.equal(await element.getAttribute("data-react-commercial-module") != null, mode === "react", `${mode} ${selector}`);
          }
        }
        const launcher = page.locator(".assistant-launcher:visible");
        await launcher.click();
        await page.locator(".assistant-panel:visible").waitFor();
        await page.locator(".assistant-panel:visible").getByRole("button", { name: "Cerrar asistente" }).click();
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions: { width: 0, height: 0 }, canvasStats: null,
          screenshot: "", sha256: mode });
        continue;
      }
      if (chartId === "talent-page") {
        await page.locator(".page-tabs button").nth(2).click();
        const panel = page.locator('.talent-page[data-operational-summary-ready="true"]:visible');
        await panel.waitFor({ timeout: 60_000 });
        await panel.locator(".talent-development-grid .training-card canvas").waitFor({ timeout: 30_000 });
        assert.equal(await panel.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        assert.equal(await panel.locator(".talent-overview-grid .card:visible").count(), 3);
        assert.equal(await panel.locator(".talent-performance-grid .card:visible").count(), 3);
        assert.equal(await panel.locator(".talent-development-grid .card:visible").count(), 3);
        const dimensions = await panel.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        await page.evaluate(() => document.fonts.ready);
        const screenshotBytes = await panel.screenshot({ path: screenshot });
        await panel.locator(".talent-kpis .birthday-kpi").click();
        await page.locator('.birthday-modal:visible').waitFor();
        await page.locator('.birthday-modal:visible .chart-expand').click();
        await panel.locator(".seller-performance-card .seller-more-btn").click();
        await panel.locator(".seller-performance-card.chart-expanded").waitFor();
        await panel.locator(".seller-performance-card .seller-more-btn").click();
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "commercial-page") {
        const panel = page.locator('.page-one:visible');
        await panel.waitFor({ timeout: 30_000 });
        await panel.locator('.meta-vs-real canvas').waitFor({ timeout: 60_000 });
        await panel.locator('.price-range-card canvas').waitFor({ timeout: 60_000 });
        assert.equal(await panel.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        assert.equal(await panel.locator('.charts-four .card:visible').count(), 3);
        assert.equal(await panel.locator('.static-charts .card:visible').count(), 3);
        const dimensions = await panel.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        await page.evaluate(() => document.fonts.ready);
        const screenshotBytes = await panel.screenshot({ path: screenshot });
        await panel.locator('.category-card .category-view-toggle button').nth(1).click();
        await panel.locator('.category-card .category-view-toggle button.active').getByText('CATEGORÍA').waitFor();
        await panel.locator('.brand-sales-card .chart-expand').click();
        await panel.locator('.brand-sales-card.chart-expanded').waitFor();
        await panel.locator('.brand-sales-card .chart-expand').click();
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "inventory-page") {
        await page.locator('.page-tabs button').nth(1).click();
        const panel = page.locator('.page-two:visible');
        await panel.waitFor({ timeout: 30_000 });
        await panel.locator('.predictive-v2 .health-card canvas').waitFor({ timeout: 60_000 });
        await panel.locator('.rotation-card .card-inline-loader').waitFor({ state: "hidden", timeout: 60_000 });
        await panel.locator('.rotation-card canvas').waitFor({ timeout: 60_000 });
        await panel.locator('.antiquity-card[data-stock-origin-ready="true"]').waitFor({ timeout: 60_000 });
        await panel.locator('.size-chart-summary').waitFor({ timeout: 60_000 });
        assert.equal(await panel.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        assert.equal(await panel.locator('.inventory-grid .card:visible').count(), 2);
        assert.equal(await panel.locator('.inventory-analysis-row .card:visible').count(), 2);
        assert.equal(await panel.locator('.predictive-overview-grid .card:visible').count(), 3);
        const dimensions = await panel.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        await page.evaluate(() => document.fonts.ready);
        const screenshotBytes = await panel.screenshot({ path: screenshot });
        await panel.locator('.rotation-switch button[aria-label="Ver capacidad y participación"]').click();
        await panel.locator('.rotation-switch button.active[aria-label="Ver capacidad y participación"]').waitFor();
        await panel.locator('.rotation-switch button[aria-label="Ver rotación por tienda"]').click();
        await panel.locator('.projection-horizon-toggle button').nth(1).click();
        await panel.locator('.projection-horizon-toggle button.active').getByText('+30D').waitFor();
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "commercial-access") {
        const panel = page.locator(".commercial-portal-host .status-panel.error:visible");
        await panel.waitFor({ timeout: 30_000 });
        assert.equal(await panel.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        await panel.evaluate(element => { element.style.background = "#fff"; });
        const dimensions = await panel.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await panel.screenshot({ path: screenshot });
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "assistant-widget") {
        const launcher = page.locator(".assistant-launcher:visible");
        await launcher.waitFor({ timeout: 30_000 });
        await launcher.click();
        const panel = page.locator(".assistant-panel:visible");
        await panel.waitFor({ timeout: 10_000 });
        assert.equal(await page.locator('[data-react-commercial-module="assistant-widget"]:visible').count(), mode === "react" ? 1 : 0);
        await page.evaluate(() => document.fonts.ready);
        const dimensions = await panel.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await panel.screenshot({ path: screenshot });
        await panel.locator("textarea").fill("Consulta de prueba");
        assert.equal(await panel.locator("textarea").inputValue(), "Consulta de prueba");
        await panel.getByRole("button", { name: "Cerrar asistente" }).click();
        await panel.waitFor({ state: "hidden" });
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "page-tabs") {
        const tabs = page.locator('.page-tabs[aria-label="Páginas del dashboard"]');
        await tabs.waitFor({ timeout: 30_000 });
        assert.equal(await tabs.getAttribute("data-react-commercial-module"), mode === "react" ? "page-tabs" : null);
        for (const [index, section] of [[1, ".page-two"], [2, ".talent-page"], [0, ".page-one"]]) {
          await tabs.locator("button").nth(index).click();
          await page.locator(section).waitFor({ state: "visible" });
          assert.match(await tabs.locator("button").nth(index).getAttribute("class") || "", /active/);
        }
        await page.evaluate(() => document.fonts.ready);
        const dimensions = await tabs.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await tabs.screenshot({ path: screenshot });
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "header") {
        const header = page.locator('.brand-header');
        await header.waitFor({ timeout: 30_000 });
        assert.equal(await header.getAttribute("data-react-commercial-module"), mode === "react" ? "header" : null);
        await page.getByRole("button", { name: "Abrir filtros y listas" }).click();
        await page.locator(".filter-panel label").first().locator("select").selectOption("2025");
        await header.locator("h1").filter({ hasText: /DASHBOARD EJECUTIVO COMERCIAL 2025/ }).waitFor();
        await page.getByRole("button", { name: "Abrir filtros y listas" }).click();
        await page.locator(".dashboard-filter-drawer").waitFor({ state: "hidden" });
        await page.evaluate(() => document.fonts.ready);
        const dimensions = await header.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await header.screenshot({ path: screenshot });
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "filters") {
        await page.getByRole("button", { name: "Abrir filtros y listas" }).click();
        const drawer = page.locator(".dashboard-filter-drawer:visible");
        await drawer.waitFor({ timeout: 30_000 });
        assert.equal(await page.locator('[data-react-commercial-module="filters"]').count(), mode === "react" ? 1 : 0);
        await drawer.locator("label").first().locator("select").selectOption("2025");
        await drawer.locator("details").first().locator("summary").click();
        await drawer.getByRole("button", { name: "ENE", exact: true }).click();
        await drawer.locator(".day-picker-trigger").click();
        await drawer.locator(".calendar-day:not([disabled])").first().click();
        await drawer.locator(".calendar-apply-btn").click();
        await drawer.locator("details").first().locator("summary").click();
        await drawer.locator(".reset").click();
        assert.equal(await drawer.locator("label").first().locator("select option:checked").innerText(), "2026");
        await page.evaluate(() => document.fonts.ready);
        const dimensions = await drawer.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await drawer.screenshot({ path: screenshot });
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "primary-kpis") {
        const strip = page.locator(".primary-kpis:visible");
        await strip.waitFor({ timeout: 30_000 });
        assert.equal(await strip.getAttribute("data-react-commercial-module"), mode === "react" ? "primary-kpis" : null);
        assert.equal(await strip.locator(".metric-card").count(), 8);
        await page.evaluate(() => document.fonts.ready);
        const dimensions = await strip.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await strip.screenshot({ path: screenshot });
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "key-kpis") {
        const strip = page.locator(".kpi-strip:visible");
        await strip.waitFor({ timeout: 30_000 });
        assert.equal(await strip.getAttribute("data-react-commercial-module"), mode === "react" ? "key-kpis" : null);
        const dimensions = await strip.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await strip.screenshot({ path: screenshot });
        await strip.locator('.ticket-kpi[title="Ver ticket promedio por mes"]').click();
        await page.locator('.ticket-modal[aria-labelledby="ticket-chart-title"]').waitFor();
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "progress") {
        const grid = page.locator(".executive-grid:visible");
        await grid.waitFor({ timeout: 30_000 });
        assert.equal(await grid.getAttribute("data-react-commercial-module"), mode === "react" ? "progress" : null);
        assert.equal(await grid.locator("article").count(), 4);
        const dimensions = await grid.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await grid.screenshot({ path: screenshot });
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "talent-kpis") {
        await page.locator(".page-tabs button").nth(2).click();
        const strip = page.locator(".talent-kpis:visible");
        await strip.waitFor({ timeout: 30_000 });
        assert.equal(await strip.getAttribute("data-react-commercial-module"), mode === "react" ? "talent-kpis" : null);
        const dimensions = await strip.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await strip.screenshot({ path: screenshot });
        await strip.locator(".birthday-kpi").click();
        await page.locator(".birthday-modal").waitFor();
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "size-controls") {
        await page.locator(".page-tabs button").nth(1).click();
        const controls = page.locator(".size-distribution-card .size-chart-controls:visible");
        await controls.waitFor({ timeout: 30_000 });
        assert.equal(await controls.getAttribute("data-react-commercial-module"), mode === "react" ? "size-controls" : null);
        const dimensions = await controls.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await controls.screenshot({ path: screenshot });
        await controls.getByRole("button", { name: "TEXTIL" }).click();
        await controls.getByRole("button", { name: "STOCK", exact: true }).click();
        await controls.getByRole("button", { name: "CALZADO" }).click();
        await controls.getByRole("button", { name: "EUR" }).click();
        await controls.getByRole("button", { name: "MATRIZ" }).click();
        await page.locator(".transfer-modal").waitFor();
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "size-card") {
        await page.locator(".page-tabs button").nth(1).click();
        const card = page.locator(".size-distribution-card:visible");
        await card.locator(".size-chart-summary").waitFor({ timeout: 60_000 });
        assert.equal(await card.getAttribute("data-react-commercial-module"), mode === "react" ? "size-card" : null);
        const dimensions = await card.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await card.screenshot({ path: screenshot });
        await card.getByRole("button", { name: "TEXTIL" }).click();
        await card.getByRole("button", { name: "STOCK", exact: true }).click();
        await card.getByRole("button", { name: "CALZADO" }).click();
        await card.getByRole("button", { name: "EUR" }).click();
        await card.locator(".chart-expand").click();
        await page.locator(".size-distribution-card.chart-expanded:visible").waitFor();
        await card.getByRole("button", { name: "MATRIZ" }).click();
        await page.locator(".transfer-modal").waitFor();
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "store-value-card") {
        await page.locator(".page-tabs button").nth(1).click();
        const card = page.locator(".store-value-coverage-card:visible");
        await card.locator(".store-value-chart-pane").waitFor({ timeout: 30_000 });
        assert.equal(await card.getAttribute("data-react-commercial-module"), mode === "react" ? "store-value-card" : null);
        await card.locator(".chart-expand").click();
        await card.locator(".inventory-matrix-card:visible").waitFor();
        const dimensions = await card.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await card.screenshot({ path: screenshot });
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "category-card") {
        const card = page.locator(".category-card:visible");
        await card.locator("canvas").waitFor({ timeout: 30_000 });
        assert.equal(await card.getAttribute("data-react-commercial-module"), mode === "react" ? "category-card" : null);
        const dimensions = await card.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await card.screenshot({ path: screenshot });
        await card.getByRole("button", { name: "CATEGORÍA" }).click();
        await card.locator(".chart-expand").click();
        await card.locator(".category-detail-table").waitFor();
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "brand-card" || chartId === "ranking-card") {
        const card = page.locator(chartId === "brand-card" ? ".brand-sales-card:visible" : ".commercial-ranking-card:visible");
        await card.locator("canvas").waitFor({ timeout: 30_000 });
        assert.equal(await card.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        const dimensions = await card.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await card.screenshot({ path: screenshot });
        if (chartId === "brand-card") {
          await card.locator(".chart-expand").click();
          await card.locator(".brand-detail-table").waitFor();
        } else {
          const button = card.getByRole("button", { name: "TICKET PROM." });
          const before = await button.getAttribute("aria-pressed");
          await button.click();
          await page.waitForTimeout(100);
          assert.notEqual(await button.getAttribute("aria-pressed"), before);
        }
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "gender-card") {
        const card = page.locator(".gender-card:visible");
        await card.locator("canvas").waitFor({ timeout: 30_000 });
        assert.equal(await card.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        const dimensions = await card.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await card.screenshot({ path: screenshot });
        await card.locator(".chart-expand").click();
        await card.locator(".gender-bar-chart canvas").waitFor();
        await card.getByRole("button", { name: "TEXTIL" }).click();
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "price-range-card") {
        const card = page.locator(".price-range-card:visible");
        await card.locator("canvas").waitFor({ timeout: 30_000 });
        assert.equal(await card.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        const dimensions = await card.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await card.screenshot({ path: screenshot });
        await card.locator(".chart-expand").click();
        await card.locator(".price-range-detail-table").waitFor();
        const select = card.locator(".price-range-years select");
        if (await select.locator("option").count() > 1) {
          const before = await select.inputValue();
          const options = await select.locator("option").evaluateAll(nodes => nodes.map(node => node.value));
          await select.selectOption(options.find(value => value !== before));
          assert.notEqual(await select.inputValue(), before);
        }
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "rotation-card") {
        await page.locator(".page-tabs button").nth(1).click();
        const card = page.locator(".rotation-card:visible");
        await card.locator("canvas").waitFor({ timeout: 30_000 });
        assert.equal(await card.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        const dimensions = await card.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await card.screenshot({ path: screenshot });
        await card.getByRole("button", { name: "Ver capacidad y participación" }).click();
        await card.locator(".capacity-donut canvas").waitFor();
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "antiquity-card") {
        await page.locator(".page-tabs button").nth(1).click();
        const card = page.locator('.antiquity-card[data-stock-origin-ready="true"]:visible');
        await card.waitFor({ timeout: 30_000 });
        await card.locator("canvas").waitFor({ timeout: 30_000 });
        assert.equal(await card.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        const dimensions = await card.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await card.screenshot({ path: screenshot });
        const bucket = card.getByRole("button", { name: "2026" });
        const before = await bucket.getAttribute("aria-pressed");
        await bucket.click();
        assert.notEqual(await bucket.getAttribute("aria-pressed"), before);
        await card.locator(".chart-expand").click();
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "health-card" || chartId === "projection-card" || chartId === "replenishment-card") {
        await page.locator(".page-tabs button").nth(1).click();
        const card = page.locator(chartId === "health-card" ? ".health-card:visible"
          : chartId === "projection-card" ? ".predictive-projection-card:visible" : ".predictive-replenishment-card:visible");
        await card.locator("canvas").waitFor({ timeout: 60_000 });
        assert.equal(await card.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        const dimensions = await card.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await card.screenshot({ path: screenshot });
        if (chartId === "projection-card") {
          await card.getByRole("button", { name: "+30D" }).click();
          await card.locator(".projection-horizon-toggle button.active").filter({ hasText: "+30D" }).waitFor({ timeout: 10_000 });
          assert.match(await card.getByRole("button", { name: "+30D" }).getAttribute("class") || "", /active/);
        }
        if (chartId === "replenishment-card") {
          await card.locator(".chart-expand").click();
          await card.locator(".predictive-detail-table").waitFor();
        }
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "seller-card") {
        await page.locator(".page-tabs button").nth(2).click();
        const card = page.locator('.seller-performance-card[data-seller-detail-ready="true"]:visible');
        await card.locator("canvas").waitFor({ timeout: 30_000 });
        await page.waitForTimeout(900);
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await card.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        const dimensions = await card.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await card.screenshot({ path: screenshot });
        await card.locator(".seller-more-btn").click();
        await card.locator(".seller-ranking-table").waitFor();
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (["ticket-modal", "conversion-modal", "traffic-modal"].includes(chartId)) {
        if (chartId === "ticket-modal") await page.locator('.ticket-kpi[title="Ver ticket promedio por mes"]').click();
        else if (chartId === "conversion-modal") await page.locator('.ticket-kpi.conversion-kpi').click();
        else await page.locator('.ticket-kpi.traffic-kpi').first().click();
        const card = page.locator(".ticket-modal:visible");
        await card.locator("canvas").waitFor({ timeout: 30_000 });
        assert.equal(await card.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        const dimensions = await card.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await card.screenshot({ path: screenshot });
        const select = card.locator(".ticket-year-selector select");
        if (await select.locator("option").count() > 1) {
          const before = await select.inputValue();
          const options = await select.locator("option").evaluateAll(nodes => nodes.map(node => node.value));
          await select.selectOption(options.find(value => value !== before));
          assert.notEqual(await select.inputValue(), before);
        }
        await card.locator(".chart-expand").click();
        await card.waitFor({ state: "hidden" });
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "stock-origin-modal") {
        await page.locator(".page-tabs button").nth(1).click();
        const antiquity = page.locator('.antiquity-card[data-stock-origin-ready="true"]:visible');
        await antiquity.waitFor({ timeout: 30_000 });
        await antiquity.locator("canvas").click({ position: { x: 70, y: 155 } });
        const card = page.locator(".stock-origin-detail:visible");
        await card.waitFor({ timeout: 5_000 });
        await antiquity.locator("canvas").dispatchEvent("mouseout");
        await page.mouse.move(5, 5);
        await page.waitForTimeout(150);
        assert.equal(await card.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        const dimensions = await card.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await card.screenshot({ path: screenshot });
        await card.locator(".chart-expand").click();
        await card.waitFor({ state: "hidden" });
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "transfer-modal") {
        await page.locator(".page-tabs button").nth(1).click();
        await page.locator(".size-distribution-card:visible").waitFor({ timeout: 30_000 });
        await page.locator(".size-distribution-card .size-chart-controls").getByRole("button", { name: "MATRIZ" }).click();
        const card = page.locator(".transfer-modal:visible");
        await card.waitFor({ timeout: 30_000 });
        assert.equal(await card.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        await card.locator('select').first().selectOption("CALZADO");
        await card.locator(".transfer-pagination").waitFor({ timeout: 90_000 });
        const dimensions = await card.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await card.screenshot({ path: screenshot });
        await card.locator(".transfer-compare").first().click();
        await card.locator(".transfer-detail-row").first().waitFor();
        await card.locator(".chart-expand").click();
        await card.waitFor({ state: "hidden" });
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "predictive-parameters") {
        await page.locator(".page-tabs button").nth(1).click();
        const controls = page.locator(".predictive-parameters:visible");
        await controls.waitFor({ timeout: 30_000 });
        assert.equal(await controls.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        await page.evaluate(() => document.fonts.ready);
        const dimensions = await controls.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await controls.screenshot({ path: screenshot });
        if (await controls.locator(".predictive-toggle button.active").count() === 1) {
          await controls.locator(".predictive-toggle button:not(.active)").click();
        }
        await controls.getByRole("button", { name: "TEXTIL" }).click();
        assert.doesNotMatch(await controls.getByRole("button", { name: "TEXTIL" }).getAttribute("class") || "", /active/);
        await controls.getByRole("button", { name: "TEXTIL" }).click();
        await controls.getByLabel("Unidad de ventana de demanda").selectOption("YEARS");
        assert.equal(await controls.getByLabel("Unidad de ventana de demanda").inputValue(), "YEARS");
        await controls.locator("input[type=number]").last().fill("7");
        assert.equal(await controls.locator("input[type=number]").last().inputValue(), "7");
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "section-heading") {
        await page.locator(".page-tabs button").nth(1).click();
        const heading = page.locator('.page-two .block-heading:visible').filter({ hasText: "COBERTURA Y DISTRIBUCIÓN" });
        await heading.waitFor({ timeout: 30_000 });
        assert.equal(await heading.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        await page.evaluate(() => document.fonts.ready);
        const dimensions = await heading.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await heading.screenshot({ path: screenshot });
        await heading.getByRole("button", { name: "VER TRASLADOS ENTRE TIENDAS" }).click();
        await page.locator(".transfer-modal:visible").waitFor({ timeout: 10_000 });
        await page.locator(".transfer-modal .chart-expand").click();
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "talent-capacity") {
        await page.locator(".page-tabs button").nth(2).click();
        await page.locator('.talent-page[data-operational-summary-ready="true"]').waitFor({ timeout: 30_000 });
        const card = page.locator(".talent-overview-grid .capacity-card:visible");
        await card.waitFor({ timeout: 30_000 });
        assert.equal(await card.getAttribute("data-react-commercial-module"), mode === "react" ? "talent-capacity" : null);
        const dimensions = await card.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await card.screenshot({ path: screenshot });
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "stock-matrix") {
        await page.locator(".page-tabs button").nth(1).click();
        const card = page.locator(".store-value-coverage-card");
        await card.locator(".store-value-chart-pane").waitFor({ timeout: 30_000 });
        await card.locator(".chart-expand").click();
        const matrix = card.locator(".inventory-matrix-card:visible");
        await matrix.waitFor();
        assert.equal(await matrix.getAttribute("data-react-commercial-module"), mode === "react" ? "stock-matrix" : null);
        const dimensions = await matrix.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await matrix.screenshot({ path: screenshot });
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "birthday-modal") {
        await page.locator(".page-tabs button").nth(2).click();
        await page.locator(".talent-kpis:visible .birthday-kpi").click();
        const modal = page.locator(".birthday-modal:visible");
        await modal.waitFor();
        assert.equal(await modal.getAttribute("data-react-commercial-module"), mode === "react" ? "birthday-modal" : null);
        const dimensions = await modal.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await modal.screenshot({ path: screenshot });
        await modal.getByRole("button", { name: "Cerrar cumpleaños" }).click();
        await modal.waitFor({ state: "hidden" });
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "growth-card") {
        const card = page.locator(".static-charts .growth:visible");
        await card.waitFor({ timeout: 30_000 });
        await card.locator("canvas").waitFor({ timeout: 30_000 });
        assert.equal(await card.getAttribute("data-react-commercial-module"), mode === "react" ? "growth-card" : null);
        await page.evaluate(() => document.fonts.ready);
        const dimensions = await card.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await card.screenshot({ path: screenshot });
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (["meta-vs-real-card", "hourly-card", "talent-history-card", "talent-team-card", "talent-area-card", "talent-store-card", "talent-exit-card", "talent-incidents-card"].includes(chartId)) {
        if (chartId.startsWith("talent-")) {
          await page.locator(".page-tabs button").nth(2).click();
          await page.locator('.talent-page[data-operational-summary-ready="true"]').waitFor({ timeout: 30_000 });
        }
        const cardSelectors = { "meta-vs-real-card": ".charts-four .meta-vs-real:visible", "hourly-card": ".hourly-insight-grid .hourly-performance-card:visible", "talent-history-card": ".talent-overview-grid .history-card:visible", "talent-team-card": ".talent-overview-grid .team-productivity-card:visible", "talent-area-card": ".talent-performance-grid .area-distribution-card:visible", "talent-store-card": ".talent-performance-grid .store-productivity-card:visible", "talent-exit-card": ".talent-development-grid .exit-card:visible", "talent-incidents-card": ".talent-development-grid .incidents-card:visible" };
        const card = page.locator(cardSelectors[chartId]);
        await card.waitFor({ timeout: 30_000 });
        await card.locator("canvas").waitFor({ timeout: 30_000 });
        assert.equal(await card.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        const dimensions = await card.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await card.screenshot({ path: screenshot });
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId === "talent-training-card") {
        await page.locator(".page-tabs button").nth(2).click();
        await page.locator('.talent-page[data-operational-summary-ready="true"]').waitFor({ timeout: 30_000 });
        const card = page.locator(".talent-development-grid .training-card:visible");
        await card.locator("canvas").waitFor({ timeout: 30_000 });
        assert.equal(await card.getAttribute("data-react-commercial-module"), mode === "react" ? chartId : null);
        const dimensions = await card.boundingBox();
        const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}.png`);
        const screenshotBytes = await card.screenshot({ path: screenshot });
        await card.getByRole("button", { name: "ADMINISTRADORES" }).click();
        assert.match(await card.getByRole("button", { name: "ADMINISTRADORES" }).getAttribute("class") || "", /active/);
        await card.locator(".chart-expand").click();
        await page.locator(".training-card.chart-expanded:visible").waitFor();
        await card.locator(".chart-expand").click();
        if (failures.length) throw new Error(failures.join("\n"));
        pair.push({ mode, dimensions, canvasStats: null, screenshot,
          sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
        continue;
      }
      if (chartId.startsWith("inventory-") || chartId.startsWith("predictive-")) {
        await page.locator(".page-tabs button").nth(1).click();
      }
      if (chartId.startsWith("talent-")) {
        await page.locator(".page-tabs button").nth(2).click();
        if (["talent-training", "talent-exit", "talent-incidents"].includes(chartId)) {
          await page.locator('.talent-page[data-operational-summary-ready="true"]').waitFor({ timeout: 30_000 });
        }
      }
      if (chartId === "modal-ticket") await page.locator('.ticket-kpi[title="Ver ticket promedio por mes"]').click();
      if (chartId === "modal-conversion") await page.locator('.ticket-kpi.conversion-kpi').click();
      if (chartId === "modal-traffic") await page.locator('.ticket-kpi.traffic-kpi').first().click();
      const talentCardClasses = {
        "talent-history": "history-card",
        "talent-team-productivity": "team-productivity-card",
        "talent-seller-performance": "seller-performance-card",
        "talent-area-distribution": "area-distribution-card",
        "talent-store-productivity": "store-productivity-card",
        "talent-training": "training-card",
        "talent-exit": "exit-card",
        "talent-incidents": "incidents-card",
      };
      const cardClass = talentCardClasses[chartId] || (chartId === "hourly-performance" ? "hourly-performance-card"
        : chartId === "category-participation" ? "category-card"
          : chartId === "price-range" ? "price-range-card"
            : chartId === "store-ranking" ? "commercial-ranking-card"
              : chartId === "brand-sales" ? "brand-sales-card"
                : chartId.startsWith("gender-") ? "gender-card"
                  : chartId === "inventory-store-value" ? "store-value-coverage-card"
                    : chartId === "inventory-sizes" ? "size-distribution-card"
                      : chartId === "inventory-antiquity" ? "antiquity-card"
                    : chartId.startsWith("inventory-") ? "rotation-card" : chartId);
      const predictiveCardClasses = { "predictive-health": "health-card", "predictive-replenishment": "predictive-replenishment-card", "predictive-projection": "predictive-projection-card" };
      const modalTitles = { "modal-ticket": "ticket-chart-title", "modal-conversion": "conversion-chart-title", "modal-traffic": "traffic-chart-title" };
      const card = chartId.startsWith("modal-")
        ? page.locator(`.ticket-modal[aria-labelledby="${modalTitles[chartId]}"]`)
        : page.locator(`.${chartId.startsWith("talent-") ? "talent-card" : chartId.startsWith("predictive-") ? "predictive-v2-card" : "chart-card"}.${predictiveCardClasses[chartId] || cardClass}`);
      try { await card.waitFor({ timeout: 30_000 }); }
      catch (error) {
        const alerts = await page.locator('[role="alert"]').allTextContents();
        throw new Error(`${scenario.role} ${mode}: gráfico ausente; ${JSON.stringify({ failures, alerts })}`, { cause: error });
      }
      if (scenario.role === "jefe_tienda" && chartId === "store-ranking") {
        assert.match(await card.locator(".ranking-store-count").innerText(), /^1 TIENDA · 1 ACTIVA/, "El ranking mostró otras tiendas");
      }
      if (scenario.year !== "2026") {
        await page.getByRole("button", { name: "Abrir filtros y listas" }).click();
        await page.locator(".filter-panel label").first().locator("select").selectOption(scenario.year);
        await page.getByRole("button", { name: "Abrir filtros y listas" }).click();
        await page.locator(".dashboard-filter-drawer").waitFor({ state: "hidden" });
      }
      if (chartId === "category-participation" && process.env.AUDIT_CATEGORY_VIEW === "LINEA") {
        await card.locator(".category-view-toggle button").last().click();
        await card.locator(".category-view-toggle button").last().waitFor({ state: "visible" });
        assert.match(await card.locator(".category-view-toggle button").last().getAttribute("class") || "", /active/);
        assert.match(await card.locator(".category-title h2").innerText(), /CATEGORÍA/);
      }
      if (rankingMarkupOnly) {
        const buttons = card.locator(".ranking-metric-toggle button");
        for (const index of [0, 2, 3]) await buttons.nth(index).click();
        for (let index = 0; index < 4; index += 1) {
          assert.equal(await buttons.nth(index).getAttribute("aria-pressed"), index === 1 ? "true" : "false",
            `${mode}: selección de markup incorrecta`);
        }
      }
      if (expandedBrand) {
        await card.locator(".chart-expand").click();
        await card.locator(".brand-detail-table").waitFor({ state: "visible" });
      }
      if (expandedInventoryValue) {
        await card.locator(".chart-expand").click();
        await card.locator(".inventory-matrix-card--embedded").waitFor({ state: "visible" });
      }
      if (chartId === "gender-bar") {
        await card.locator(".chart-expand").click();
        await card.locator(".gender-bar-chart").waitFor({ state: "visible" });
      }
      if (chartId === "inventory-capacity") {
        await card.locator(".rotation-switch button").last().click();
        await card.locator(".capacity-donut").waitFor({ state: "visible" });
      }
      if (chartId === "inventory-rotation" || chartId === "inventory-store-value") {
        await page.locator('.rotation-card[data-stock-hierarchy-ready="true"]').waitFor({ timeout: 30_000 });
      }
      if (chartId === "inventory-antiquity") {
        await page.locator('.antiquity-card[data-stock-origin-ready="true"]').waitFor({ timeout: 30_000 });
      }
      if (chartId === "talent-seller-performance") {
        await page.locator('.seller-performance-card[data-seller-detail-ready="true"]').waitFor({ timeout: 30_000 });
      }
      if (chartId === "inventory-sizes") {
        const controls = card.locator(".size-chart-controls > div");
        if (sizeRubro === "TEXTIL") await controls.nth(0).locator("button").last().click();
        if (sizeMetric === "STOCK") await controls.nth(1).locator("button").nth(1).click();
        if (sizeMetric === "TRANSFERS") await controls.nth(1).locator("button").nth(2).click();
        if (sizeRubro === "CALZADO" && sizeSystem === "EUR") await controls.nth(2).locator("button").last().click();
        const mapped = card.locator(".size-chart-summary span:nth-child(2) strong");
        await mapped.waitFor({ timeout: 90_000 });
        if (sizeRubro === "TEXTIL") {
          await card.getByText("Sin tallas textiles mapeadas en los códigos actuales.").waitFor({ state: "visible", timeout: 90_000 });
        } else {
          await card.locator(".card-inline-loader--overlay").waitFor({ state: "hidden", timeout: 90_000 });
        }
        let mappedCount = 0;
        for (let attempt = 0; attempt < 40; attempt += 1) {
          mappedCount = Number((await mapped.innerText()).replace(/[^\d]/g, ""));
          if (mappedCount > 0) break;
          await page.waitForTimeout(250);
        }
        if (sizeRubro === "CALZADO") assert.ok(mappedCount > 0, `${mode}: no se mapearon SKU de calzado`);
        const totalCount = Number((await card.locator(".size-chart-summary span:first-child strong").innerText()).replace(/[^\d]/g, ""));
        assert.ok(totalCount > 0, `${mode}: no hay SKU del rubro ${sizeRubro}`);
        if (sizeRubro === "TEXTIL" && mappedCount === 0) {
          await card.getByText("Sin tallas textiles mapeadas en los códigos actuales.").waitFor({ state: "visible" });
        }
      }
      if (genderTextil) {
        await card.locator(".gender-rubro-toggle button").last().click();
        await card.locator(".gender-rubro-toggle button:nth-child(2).active").waitFor({ state: "hidden" });
        assert.match(await card.locator(".gender-rubro-toggle button").first().getAttribute("class") || "", /active/);
      }
      if (releaseGoals) {
        await card.locator(".card-inline-loader").waitFor({ state: "visible", timeout: 30_000 });
        assert.equal(await card.locator("canvas").count(), 0, "El gráfico apareció antes de cargar las metas");
        await card.screenshot({ animations: "disabled", path: join(output,
          `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}-${mode}-loading.png`) });
        releaseGoals();
      }
      const canvas = chartId === "gender-bar" ? card.locator(".gender-bar-chart canvas")
        : chartId === "gender-donut" ? card.locator(".gender-donut-pane canvas")
          : chartId === "inventory-capacity" ? card.locator(".capacity-donut canvas") : card.locator("canvas");
      if (goalsRequest) {
        const goalsResponse = await goalsRequest;
        assert.equal(goalsResponse.status(), 200, `${mode}: faltan metas comerciales`);
        const goalsBody = await goalsResponse.json();
        assert.ok(goalsBody.goals?.length > 0, `${mode}: metas comerciales vacías`);
        await card.locator(".card-inline-loader").waitFor({ state: "hidden" });
      }
      try { await canvas.waitFor({ timeout: 30_000 }); }
      catch (error) {
        throw new Error(`${scenario.role} ${mode}: gráfico sin lienzo; ${JSON.stringify({
          failures, goalEvents, cardText: (await card.innerText()).slice(0, 180),
        })}`, { cause: error });
      }
      let painted = false;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        painted = await canvas.evaluate(element => {
          const pixels = element.getContext("2d")?.getImageData(0, 0, element.width, element.height).data;
          if (!pixels) return false;
          for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) return true;
          return false;
        });
        if (painted) break;
        await page.waitForTimeout(100);
      }
      assert.ok(painted, `${mode}: ECharts no pintó el lienzo`);
      const reactCount = await card.locator(`[data-react-commercial-chart="${chartId}"]`).count();
      assert.equal(reactCount, mode === "react" ? 1 : 0, `${mode}: motor incorrecto`);
      const dimensions = await card.boundingBox();
      const screenshot = join(output, `${chartId}-${scenario.role}-${scenario.width}-${scenario.year}${captureSuffix}-${mode}.png`);
      await page.evaluate(() => document.fonts.ready);
      let screenshotBytes;
      let previousHash = "";
      for (let attempt = 0; attempt < 20; attempt += 1) {
        screenshotBytes = await card.screenshot({ path: screenshot });
        const hash = createHash("sha256").update(screenshotBytes).digest("hex");
        if (hash === previousHash) break;
        previousHash = hash;
        await page.waitForTimeout(100);
      }
      const canvasStats = await canvas.evaluate(element => {
        const pixels = element.getContext("2d")?.getImageData(0, 0, element.width, element.height).data;
        let visible = 0;
        if (pixels) for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] > 0 && Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) < 230) visible += 1;
        }
        return { width: element.width, height: element.height, visible };
      });
      if (failures.length) throw new Error(failures.join("\n"));
      pair.push({ mode, dimensions, canvasStats, screenshot,
        sha256: createHash("sha256").update(screenshotBytes).digest("hex") });
      if (chartId === "inventory-antiquity" && scenario.width === 1440) {
        await canvas.click({ position: { x: 70, y: 155 } });
        await page.locator('.stock-origin-detail[role="dialog"]').waitFor({ state: "visible", timeout: 5_000 });
      }
    } finally {
      await context.close();
    }
    }
    assert.ok(Math.abs(pair[0].dimensions.width - pair[1].dimensions.width) < 1, "Ancho distinto");
    const pageHeightTolerance = ["commercial-page", "inventory-page"].includes(chartId) ? 10 : 1;
    assert.ok(Math.abs(pair[0].dimensions.height - pair[1].dimensions.height) < pageHeightTolerance, "Alto distinto");
    if (["talent-training", "predictive-replenishment"].includes(chartId)) {
      assert.equal(pair[0].canvasStats.width, pair[1].canvasStats.width, "Ancho del lienzo distinto");
      assert.equal(pair[0].canvasStats.height, pair[1].canvasStats.height, "Alto del lienzo distinto");
      assert.ok(Math.abs(pair[0].canvasStats.visible - pair[1].canvasStats.visible) <= (chartId === "talent-training" ? 100 : 50),
        "Las barras y etiquetas del gráfico difieren demasiado");
    } else {
      assert.deepEqual(pair[0].canvasStats, pair[1].canvasStats, "El lienzo del gráfico difiere");
    }
    results.push({ ...scenario, dimensions: pair[0].dimensions, canvasStats: pair[0].canvasStats,
      captures: pair.map(item => ({ mode: item.mode, screenshot: item.screenshot, sha256: item.sha256 })) });
  }
  console.log(JSON.stringify(results.map(({ role, width, year, canvasStats, captures }) => ({
    role, width, year, canvasStats, equal: captures[0].sha256 === captures[1].sha256,
  }))));
} finally {
  await browser.close();
}
