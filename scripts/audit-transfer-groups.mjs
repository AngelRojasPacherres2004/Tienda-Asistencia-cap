import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5180';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: scopes, error: scopeError } = await db.from('commercial_user_scopes').select('usuario_id').eq('scope_type', 'store').eq('scope_value', 'T012');
assert.ifError(scopeError);
const fields = 'id,rol,tienda_id,estado,cambio_credenciales_pendiente';
const { data: admins } = await db.from('usuarios').select(fields).in('id', scopes.map(row => row.usuario_id)).eq('estado', 'activo');
const admin = admins.find(row => !row.cambio_credenciales_pendiente);
const { data: managers } = await db.from('usuarios').select(fields).eq('rol', 'gerente_comercial').eq('estado', 'activo');
const manager = managers.find(row => !row.cambio_credenciales_pendiente);
assert.ok(admin && manager);
const token = user => jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '15m' });
async function request(user, method, path, body) {
  const response = await fetch(`${origin}/api${path}`, { method, headers: { Cookie: `asiste_session=${token(user)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() };
}
const cleanup = new Set();
let browser;
try {
  const routesResponse = await request(admin, 'GET', '/commercial/store-transfers');
  assert.equal(routesResponse.status, 200);
  const destinations = new Map();
  for (const route of routesResponse.body.routes.filter(row => row.category === 'CALZADO')) {
    const candidates = destinations.get(route.destination) || [];
    if (!candidates.some(row => row.productId === route.productId)) candidates.push(route);
    destinations.set(route.destination, candidates);
  }
  const routes = [...destinations.values()].find(rows => rows.length >= 2).slice(0, 2);
  const groupId = randomUUID(); cleanup.add(groupId);
  const payload = { groupId, items: routes.map(row => ({ productId: row.productId, source: row.source, destination: row.destination, quantity: 1, size: '' })) };
  assert.equal((await request(admin, 'POST', '/commercial/transfer-groups', payload)).status, 201);
  assert.equal((await request(admin, 'POST', '/commercial/transfer-groups', payload)).status, 201);
  let { data: lines } = await db.from('commercial_transfer_items').select('*').eq('grupo_id', groupId);
  assert.equal(lines.length, 2); assert(lines.every(row => row.numero_guia === '' && row.estado === 'pendiente'));
  assert.equal((await request(admin, 'PATCH', '/commercial/transfer-groups', { groupId, action: 'guide', guide: 'REJECT' })).status, 409);
  assert.equal((await request(admin, 'PATCH', '/commercial/transfer-groups', { groupId, action: 'validate' })).status, 403);
  const badOrigin = { groupId: randomUUID(), items: [{ ...payload.items[0], source: 'T001' }] };
  assert.equal((await request(admin, 'POST', '/commercial/transfer-groups', badOrigin)).status, 403);
  const tooMany = { groupId: randomUUID(), items: [{ ...payload.items[0], quantity: 999999 }] };
  assert.equal((await request(admin, 'POST', '/commercial/transfer-groups', tooMany)).status, 400);
  assert.equal((await request(admin, 'POST', '/commercial/transfer-groups', { ...payload, items: [{ ...payload.items[0], quantity: 2 }] })).status, 409);
  const { data: others } = await db.from('usuarios').select(fields).eq('rol', 'jefe_tienda').eq('estado', 'activo').neq('tienda_id', admin.tienda_id).limit(10);
  const other = others.find(row => !row.cambio_credenciales_pendiente);
  if (other) {
    assert.equal((await request(other, 'PATCH', '/commercial/transfer-groups', { groupId, action: 'guide', guide: 'REJECT' })).status, 403);
    const listing = await request(other, 'GET', '/commercial/transfer-groups');
    assert([200, 403].includes(listing.status));
    if (listing.status === 200) assert(!listing.body.groups.some(group => group.id === groupId));
  }
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  await mkdir('artifacts', { recursive: true });
  async function open(user) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Lima' });
    await context.addCookies([{ name: 'asiste_session', value: token(user), url: origin, httpOnly: true, sameSite: 'Lax' }]);
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-react-commercial-shell="true"]').waitFor({ timeout: 60_000 });
    await page.locator('.page-tabs button').nth(1).click();
    await page.locator('.size-distribution-card .transfer-cart-trigger').click();
    await page.locator('.transfer-cart-sections button').nth(1).click();
    await page.locator(`[data-transfer-group-id="${groupId}"]`).waitFor({ timeout: 60_000 });
    return { page, context };
  }
  const owner = await open(admin);
  let group = owner.page.locator(`[data-transfer-group-id="${groupId}"]`);
  assert(await group.locator('input').isDisabled());
  assert.equal(await group.getByRole('button', { name: 'Validar', exact: true }).count(), 0);
  await owner.page.reload({ waitUntil: 'domcontentloaded' });
  await owner.page.locator('.page-tabs button').nth(1).click();
  await owner.page.locator('.size-distribution-card .transfer-cart-trigger').click();
  await owner.page.locator('.transfer-cart-sections button').nth(1).click();
  await group.waitFor();
  const reviewer = await open(manager);
  const reviewed = reviewer.page.locator(`[data-transfer-group-id="${groupId}"]`);
  await reviewed.getByRole('button', { name: 'Validar', exact: true }).click();
  await reviewer.page.waitForFunction(id => document.querySelector('app-root')?.shadowRoot?.querySelector(`[data-transfer-group-id="${id}"] input`)?.disabled === false, groupId);
  await owner.page.getByRole('button', { name: 'Actualizar grupos guardados' }).click();
  await owner.page.waitForFunction(id => document.querySelector('app-root')?.shadowRoot?.querySelector(`[data-transfer-group-id="${id}"] input`)?.disabled === false, groupId);
  const guide = `AUDIT-${Date.now()}`;
  await group.locator('input').fill(guide);
  const update = owner.page.waitForResponse(response => response.url().includes('/commercial/transfer-groups') && response.request().method() === 'PATCH');
  await group.getByRole('button', { name: /^Guardar guía/ }).click();
  assert.equal((await update).status(), 200);
  ({ data: lines } = await db.from('commercial_transfer_items').select('*').eq('grupo_id', groupId));
  assert.equal(lines.length, 2); assert(lines.every(row => row.numero_guia === guide && row.estado === 'validado' && row.validado_por === manager.id));
  await group.waitFor();
  await group.locator('.transfer-cart-group-toggle').click();
  assert.equal(await group.locator('li').count(), 2);
  await owner.page.screenshot({ path: 'artifacts/transfer-groups-saved.png' });
  await owner.page.setViewportSize({ width: 390, height: 844 });
  await owner.page.screenshot({ path: 'artifacts/transfer-groups-saved-mobile.png' });
  await owner.page.setViewportSize({ width: 1440, height: 1000 });
  await owner.page.getByRole('button', { name: 'Cerrar selección de traslados' }).click();
  await owner.page.locator('.size-distribution-card .size-view-switch button').nth(1).click();
  await owner.page.locator('.transfer-modal .transfer-filters select').first().selectOption('CALZADO', { timeout: 90_000 });
  await owner.page.locator('.transfer-product-row .transfer-cart-add:not(:disabled)').first().click();
  await owner.page.locator('.transfer-modal .transfer-cart-trigger').click();
  await owner.page.locator('.transfer-cart-sections button').first().click();
  const saving = owner.page.waitForResponse(response => response.url().includes('/commercial/transfer-groups') && response.request().method() === 'POST');
  await owner.page.locator('.transfer-cart-dialog .transfer-group-save').first().click();
  const savedResponse = await saving; const savedPayload = await savedResponse.json();
  if (savedPayload.groupId) cleanup.add(savedPayload.groupId);
  assert.equal(savedResponse.status(), 201);
  await owner.page.locator(`[data-transfer-group-id="${savedPayload.groupId}"]`).waitFor();
  console.log('OK: filas por producto, reintentos sin duplicar, persistencia al recargar, permisos, validación de gerente, guía uniforme, móvil y botón Guardar.');
} finally {
  if (browser) await browser.close();
  for (const id of cleanup) {
    const { error } = await db.from('commercial_transfer_items').delete().eq('grupo_id', id);
    if (error) throw error;
  }
}
