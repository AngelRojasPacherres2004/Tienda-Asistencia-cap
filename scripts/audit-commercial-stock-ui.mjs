// Read-only visual smoke test for the commercial inventory dashboard.
import { loadEnv } from 'vite';
import jwt from 'jsonwebtoken';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

Object.assign(process.env, loadEnv('development', process.cwd(), ''));
if (!process.env.SUPABASE_URL?.includes('xtnihjzqnxozbotymoma.supabase.co')) {
  throw new Error('El entorno no apunta a bd-app.');
}
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5187';
const response = await fetch(
  `${process.env.SUPABASE_URL}/rest/v1/usuarios?select=id,rol,tienda_id,estado,cambio_credenciales_pendiente&rol=eq.gerente_comercial&estado=eq.activo&limit=10`,
  { headers: { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` } },
);
if (!response.ok) throw new Error(`No se pudo leer la cuenta comercial: HTTP ${response.status}`);
const people = await response.json();
const user = people.find(row => !row.cambio_credenciales_pendiente);
if (!user) throw new Error('No hay usuario comercial activo para la prueba.');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, timezoneId: 'America/Lima' });
const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '10m' });
await context.addCookies([{ name: 'asiste_session', value: token, url: origin, httpOnly: true, sameSite: 'Lax' }]);
const page = await context.newPage();
const failures = [];
const stockResponses = [];
page.on('pageerror', error => failures.push(`JavaScript: ${error.message}`));
page.on('response', response => {
  if (!response.url().includes('/api/')) return;
  if (response.status() >= 400) failures.push(`API ${response.status()}: ${new URL(response.url()).pathname}`);
  if (response.url().includes('/commercial/stock-insights')) stockResponses.push(response.status());
});
await page.route('**/api/**', route => {
  const request = route.request();
  const allowedPost = ['/api/commercial/stock-insights', '/api/commercial/product-codes'];
  if (request.method() !== 'GET' && !(request.method() === 'POST' && allowedPost.some(path => request.url().endsWith(path)))) {
    failures.push(`Escritura inesperada: ${request.method()} ${new URL(request.url()).pathname}`);
    return route.abort();
  }
  return route.continue();
});
try {
  await page.goto(`${origin}/comercial/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByRole('button', { name: /INVENTARIO Y PREDICTIVO/ }).waitFor({ timeout: 90_000 });
  await page.getByRole('button', { name: /INVENTARIO Y PREDICTIVO/ }).click();
  await page.locator('.health-card').waitFor({ timeout: 90_000 });
  await page.getByRole('heading', { name: /SALUD DEL INVENTARIO/ }).waitFor({ timeout: 90_000 });
  if (!stockResponses.includes(200)) throw new Error('No hubo respuesta correcta de stock-insights.');
  const healthValues = await page.locator('.health-card .health-table span').allTextContents();
  if (!healthValues.some(value => value.includes('S/'))) throw new Error('El panel de salud no muestra valores de inventario.');
  const output = join(process.env.LOCALAPPDATA || process.cwd(), 'DashBoardGeneral', 'audits');
  await mkdir(output, { recursive: true });
  const screenshot = join(output, 'stock-insights-desktop.png');
  await page.locator('.health-card').screenshot({ path: screenshot });
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(`Inventario comercial visible; stock API HTTP 200; captura: ${screenshot}`);
} finally {
  await context.close();
  await browser.close();
}
