import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 900 }, timezoneId: 'America/Lima' });
const account = { id: 1, rol: 'jefe_tienda', tienda_id: 1, tienda_nombre: 'LA MARINA', dni: '12345678', nombres: 'Ana', apellidos: 'Prueba' };
const employee = { id: 2, nombres: 'Luis', apellidos: 'Prueba', dni: '12345678', telefono: '999999999', distrito: 'LIMA', rol: 'vendedor', estado: 'activo', fecha_ingreso: '2025-01-01' };
const errors = [];
let warningCreated = false;
let uploaded = null;
let newPerson = null;
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/**', route => {
  const url = new URL(route.request().url());
  let body = [];
  if (url.pathname.endsWith('/auth/me')) body = { user: account };
  else if (url.pathname.endsWith('/usuarios') && route.request().method() === 'POST') { newPerson = route.request().postDataJSON(); body = { id: 3 }; }
  else if (url.pathname.endsWith('/usuarios')) body = [employee];
  else if (url.pathname.endsWith('/asistencias')) body = { empleados: [{ usuario_id: 2, nombre: 'Luis Prueba', dni: '12345678', estado: 'activo', registro: null }] };
  else if (url.pathname.endsWith('/capacitaciones/trabajadores/2')) body = { cursos: [] };
  else if (url.pathname.endsWith('/amonestaciones') && route.request().method() === 'POST') { warningCreated = true; body = { id: 12 }; }
  else if (url.pathname.endsWith('/amonestaciones')) body = warningCreated ? [{ id: 12, usuario_id: 2, tipo: 'verbal', fecha: '2026-10-28', motivo: 'Prueba' }] : [];
  else if (url.pathname.endsWith('/mi-tienda-gestion/archivo')) { uploaded = route.request().postDataJSON(); body = { path: '1/amonestacion-12/evidencia.pdf' }; }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});
try {
  await page.goto('http://127.0.0.1:5180/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Personal', exact: true }).click();
  const footer = page.locator('.user-chip');
  assert.match(await footer.innerText(), /Administrador de tienda/);
  assert.match(await footer.innerText(), /LA MARINA.*MAR/);
  assert.doesNotMatch(await footer.innerText(), /DNI/);
  await page.getByRole('button', { name: 'Nuevo personal' }).click();
  const dialog = page.getByRole('dialog');
  const labels = await dialog.locator('form > label > span').allTextContents();
  assert.deepEqual(labels.slice(0, 6), ['Tipo de documento', 'DNI', 'Nombres', 'Apellidos', 'Teléfono', 'Correo']);
  await dialog.locator('input[name="dni"]').fill('12');
  await dialog.locator('input[name="nombres"]').focus();
  assert.equal(await dialog.locator('label.field--error').count(), 1);
  assert.equal(await dialog.getByText('Régimen / jornada').count(), 0);
  for (const role of ['jefe_area', 'seguridad', 'caja', 'almacenero', 'vendedor', 'asistente']) {
    await dialog.locator('select[name="rol"]').selectOption(role);
    assert.equal(await dialog.locator('input[name="usuario"]').count(), 0);
  }
  await dialog.locator('select[name="rol"]').selectOption('jefe_seguridad');
  assert.equal(await dialog.locator('input[name="usuario"]').count(), 1);
  await dialog.locator('select[name="rol"]').selectOption('asistente_tienda');
  assert.equal(await dialog.locator('input[name="password"]').count(), 1);
  await dialog.locator('input[name="dni"]').fill('87654321');
  await dialog.locator('input[name="nombres"]').fill('María');
  await dialog.locator('input[name="apellidos"]').fill('Pérez');
  for (const [name, value] of Object.entries({ telefono: '999999999', email: 'maria@example.com', fecha_nacimiento: '1990-01-01', sueldo: '1200', telefono_emergencia: '999999998', contacto_emergencia: 'Ana Pérez', direccion: 'Calle 1', carrera: 'Comercio', numero_hijos: '0', talla_zapatillas: '38', alergia: 'Ninguna', condicion_salud: 'Ninguna' })) {
    await dialog.locator(`[name="${name}"]`).fill(value);
  }
  for (const [name, value] of Object.entries({ sexo: 'mujer', nacionalidad: 'Perú', distrito: 'LIMA', grado_academico: 'secundaria', estado_civil: 'soltero', talla_polo: 'm' })) {
    await dialog.locator(`[name="${name}"]`).selectOption(value);
  }
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  assert.equal(newPerson?.estado, 'activo');
  assert.equal(newPerson?.dni, '87654321');
  assert.ok(await page.getByText('Distrito', { exact: true }).count());
  await page.getByRole('button', { name: 'Ver ficha' }).click();
  const workerDialog = page.getByRole('dialog');
  assert.equal(await workerDialog.locator('.worker-warning-form').evaluate(element => element.scrollWidth <= element.clientWidth), true);
  await workerDialog.locator('.worker-warning-form input[placeholder="Motivo"]').fill('Prueba');
  await workerDialog.locator('.worker-warning-form input[type="file"]').setInputFiles({ name: 'evidencia.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') });
  await workerDialog.getByRole('button', { name: 'Registrar amonestación' }).click();
  await workerDialog.getByText('Prueba', { exact: true }).waitFor();
  assert.equal(uploaded?.carpeta, 'amonestacion-12');
  await workerDialog.getByRole('button', { name: /cerrar/i }).first().click();
  await page.getByRole('button', { name: 'Asistencias', exact: true }).click();
  await page.locator('.attendance-row').waitFor();
  assert.equal(await page.locator('.attendance-row .avatar').count(), 0);
  assert.equal(await page.locator('.attendance-scroller__viewport').evaluate(element => element.scrollWidth <= element.clientWidth), true);
  assert.equal(await page.locator('.toolbar select').count(), 0);
  const date = page.locator('.toolbar input[type="date"]');
  await date.fill(await date.getAttribute('min'));
  assert.equal(await page.locator('.attendance-check:not(:disabled)').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Guardar asistencia' }).isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log('Alta, validación, tabla y asistencia histórica del administrador comprobadas.');
} finally { await browser.close(); }
