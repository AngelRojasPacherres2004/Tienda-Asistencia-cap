import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const deletes = [];
  let suspended = false;
  const group = { id: 'a0000000-0000-4000-8000-000000000001', origin: 'T001', destination: 'T002', status: 'pendiente', guide: '', createdAt: '2026-11-10T12:00:00Z', quantity: 3, items: [{ product: 'Producto temporal', code: 'ABC', quantity: 3 }] };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api', '');
    let body = {};
    if (route.request().method() === 'PATCH') { suspended = route.request().postDataJSON().suspended; body = { person: { id: 22, suspendido_sistemas: suspended, estado: suspended ? 'inactivo' : 'activo' } }; }
    else if (route.request().method() === 'DELETE') { deletes.push(path); body = { deleted: true }; }
    else if (path === '/auth/me') body = { user: { id: 1, nombres: 'Sistemas', apellidos: 'Prueba', rol: 'sistemas', usuario: 'prueba', estado: 'activo' } };
    else if (path === '/systems/maintenance/transfers') body = { groups: [group] };
    else if (path === '/systems/maintenance/personnel') body = { people: [{ id: 22, nombres: 'Persona', apellidos: 'Temporal', dni: '00000000', rol: 'trabajador', estado: suspended ? 'inactivo' : 'activo', suspendido_sistemas: suspended, tienda_nombre: 'Tienda de prueba' }] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5181');
  await page.getByRole('button', { name: 'Gestión de registros', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminar grupo', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(deletes.length, 0);
  await page.getByRole('button', { name: 'Eliminar grupo', exact: true }).click();
  await page.getByRole('button', { name: 'Sí, eliminar', exact: true }).click();
  await page.getByText('Grupo de transferencias eliminado.', { exact: true }).waitFor();
  assert.deepEqual(deletes, [`/systems/maintenance/transfers/${group.id}`]);
  await page.getByRole('button', { name: 'Personal por tienda', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminar persona', exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Buscar registros' }).fill('inexistente');
  await page.getByText('No hay registros que coincidan.', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Buscar registros' }).fill('Persona');
  await page.getByRole('button', { name: 'Suspender', exact: true }).click();
  await page.getByRole('button', { name: 'Sí, suspender', exact: true }).click();
  await page.getByText('No hay registros que coincidan.', { exact: true }).waitFor();
  assert.equal(suspended, true);
  await page.getByLabel('Visibilidad').selectOption('suspended');
  await page.getByRole('button', { name: 'Reactivar', exact: true }).click();
  await page.getByRole('button', { name: 'Sí, reactivar', exact: true }).click();
  await page.getByText('No hay registros que coincidan.', { exact: true }).waitFor();
  assert.equal(suspended, false);
  await page.getByLabel('Visibilidad').selectOption('visible');
  await page.getByRole('button', { name: 'Eliminar persona', exact: true }).click();
  await page.getByRole('heading', { name: 'Eliminar persona e historial', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Sí, eliminar', exact: true }).click();
  await page.getByText('Persona e historial personal eliminados definitivamente.', { exact: true }).waitFor();
  assert.equal(deletes.at(-1), '/systems/maintenance/personnel/22');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminar persona', exact: true }).waitFor();
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/systems-maintenance-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('UI verificada: acceso de Sistemas, búsqueda, cancelación y confirmación de ambos borrados; solo API simulada.');
} finally { await browser.close(); }
