import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { chromium } from 'playwright-core';
import { loadEnv } from 'vite';

Object.assign(process.env, loadEnv('development', process.cwd(), ''));
const origin = 'http://127.0.0.1:5180';
const headers = { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` };
console.log('Leyendo cuentas para comprobación de solo lectura…');
const accounts = await fetch(`${process.env.SUPABASE_URL}/rest/v1/usuarios?select=id,rol,tienda_id,estado,cambio_credenciales_pendiente&rol=in.(gerente_comercial,jefe_zonal)&estado=eq.activo&cambio_credenciales_pendiente=eq.false`, { headers, signal: AbortSignal.timeout(20000) });
assert.equal(accounts.status, 200);
const users = await accounts.json();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const headings = {};
try {
  for (const role of ['gerente_comercial', 'jefe_zonal']) {
    const user = users.find(row => row.rol === role);
    console.log(`Comprobando ${role}…`);
    assert.ok(user, `Falta cuenta de ${role}`);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Lima' });
    await context.addCookies([{ name: 'asiste_session', value: jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '15m' }), url: origin, httpOnly: true, sameSite: 'Lax' }]);
    const page = await context.newPage();
    await page.addLocatorHandler(page.getByRole('button', { name: 'Más tarde', exact: true }), async button => { await button.click(); });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && response.url().includes('/api/')) console.log(`${role}: HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
    const storesResponse = await context.request.get(`${origin}/api/tiendas`);
    assert.equal(storesResponse.status(), 200);
    const stores = await storesResponse.json();
    const allowed = new Set(stores.map(store => String(store.id)));
    const queries = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/dashboard') queries.push(url.searchParams.get('tienda_id'));
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    console.log(`${role}: página abierta`);
    await page.locator('[data-react-commercial-shell="true"]').waitFor({ timeout: 60000 });
    console.log(`${role}: dashboard montado`);
    const dismiss = page.getByRole('button', { name: 'Más tarde', exact: true });
    if (await dismiss.isVisible()) await dismiss.click();
    await page.getByRole('button', { name: /03.*OPERACIÓN Y EQUIPO/ }).click();
    console.log(`${role}: pestaña 3 abierta`);
    await page.locator('.commercial-store-personnel').waitFor({ timeout: 30000 }).catch(async error => {
      await page.screenshot({ path: `artifacts/auditoria-resumen-${role}-error.png`, fullPage: true });
      console.log((await page.locator('body').innerText()).slice(-2500));
      throw error;
    });
    headings[role] = await page.locator('.manager-talent-page .section-heading').allTextContents();
    assert.ok(queries.length > 0);
    assert.ok(queries.every(id => id === null || allowed.has(id)), 'Consulta fuera de tiendas visibles');
    if (role === 'jefe_zonal') {
      await page.locator('.zonal-operational-details>summary').click();
      await page.getByRole('heading', { name: 'Tiendas de la zona', exact: true }).waitFor({ timeout: 30000 });
      await page.getByRole('heading', { name: 'Pulso operativo por tienda', exact: true }).waitFor({ timeout: 60000 });
      const picker = page.getByLabel('Seleccionar tienda', { exact: true });
      const options = await picker.locator('option').evaluateAll(nodes => nodes.map(node => node.value));
      assert.ok(options.filter(id => id !== 'all').every(id => allowed.has(id)));
      const store = options.find(id => id !== 'all');
      assert.ok(store);
      await picker.selectOption(store);
      await page.getByRole('button', { name: 'Exportar resumen', exact: true }).waitFor({ timeout: 60000 });
      await page.getByRole('heading', { name: /Matriz de asistencia/ }).waitFor({ timeout: 60000 });
      await page.getByRole('heading', { name: 'Historial de capacitaciones', exact: true }).waitFor({ timeout: 60000 });
      await page.screenshot({ path: 'artifacts/zonal-resumen-comercial-integrado.png', fullPage: true });
      await page.getByRole('button', { name: 'Abrir filtros y listas', exact: true }).click();
      const globalPicker = page.getByLabel('Tienda del dashboard', { exact: true });
      const globalOptions = await globalPicker.locator('option').evaluateAll(nodes => nodes.map(node => node.value));
      assert.ok(globalOptions.length > 1 && globalOptions.length <= allowed.size + 1);
      await globalPicker.selectOption(globalOptions[1]);
      await page.getByRole('button', { name: 'Cerrar filtros', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.commercial-store-personnel')?.children.length === 2, { timeout: 30000 });
      assert.ok(queries.at(-1) && allowed.has(queries.at(-1)), 'Filtro global debe consultar una tienda de la zona');
      await page.locator('.zonal-operational-details>summary').click();
      await page.getByRole('heading', { name: /Matriz de asistencia/ }).waitFor({ timeout: 30000 });
      const detailOptions = await page.getByLabel('Seleccionar tienda', { exact: true }).locator('option').evaluateAll(nodes => nodes.map(node => node.value));
      assert.deepEqual(detailOptions.filter(id => id !== 'all'), [queries.at(-1)]);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: 'artifacts/zonal-resumen-comercial-movil.png' });
      console.log('Zonal: comparativa, matriz, exportación e historial accesibles desde pestaña 3; tiendas dentro de su zona.');
    }
    assert.deepEqual(errors, []);
    console.log(`${role}: estructura comercial cargada; ${queries.length} consultas operativas limitadas a sus tiendas.`);
    await context.close();
  }
  assert.deepEqual(headings.jefe_zonal, headings.gerente_comercial);
  console.log('Gerente y Zonal comparten las mismas secciones principales en pestaña 3.');
} finally { await browser.close(); }
