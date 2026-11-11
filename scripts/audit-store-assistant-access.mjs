import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';

const origin = 'http://127.0.0.1:5180';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: accounts, error } = await db.from('usuarios').select('id,rol,tienda_id,estado,cambio_credenciales_pendiente').eq('rol', 'asistente_tienda').eq('estado', 'activo').eq('cambio_credenciales_pendiente', false).order('id').limit(1);
assert.ifError(error);
const user = accounts?.[0];
assert.ok(user?.tienda_id, 'An active store assistant is required for this read-only audit.');
const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '10m' });
const headers = { Cookie: `asiste_session=${token}`, 'Content-Type': 'application/json' };
for (const path of ['/auth/me', '/commercial/access', '/mi-tienda-gestion', '/reportes/personal', '/movimientos']) {
  const response = await fetch(`${origin}/api${path}`, { headers });
  console.log(path, response.status);
  assert.equal(response.status, 200);
}
const denied = await fetch(`${origin}/api/incidencias`, { method: 'POST', headers, body: JSON.stringify({ tipo: 'falla_interna', gravedad: 'media', descripcion: 'Permission verification' }) });
assert.equal(denied.status, 403);
console.log('assistant incident creation blocked: 403');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Lima' });
  await context.addCookies([{ name: 'asiste_session', value: token, url: origin, httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('.page-tabs button').nth(2).waitFor({ timeout: 60_000 });
  await page.locator('.page-tabs button').nth(2).click();
  await page.locator('.store-talent-page').waitFor();
  assert.equal(await page.locator('.sidebar').getByText('Incidencias', { exact: true }).count(), 0);
  assert.equal(await page.locator('.sidebar').getByText('Mi tienda', { exact: true }).count(), 1);
  assert.equal(await page.locator('.sidebar').getByText('Transferencia', { exact: true }).count(), 1);
  assert.deepEqual(errors, []);
  console.log('assistant UI: shared store dashboard, third section, matching sidebar, no browser errors');
} finally { await browser.close(); }
