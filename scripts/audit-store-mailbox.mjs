import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const role of ['jefe_zonal', 'jefe_tienda']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const uid = role === 'jefe_zonal' ? 1 : 2;
    const other = uid === 1 ? 2 : 1;
    const stores = [{ id: 10, nombre: 'ARAMBURÚ' }, { id: 11, nombre: 'ANGAMOS' }, { id: 12, nombre: 'AYACUCHO' }];
    const messages = stores.slice(0, 2).map((store, i) => ({ id: i + 1, tienda_id: store.id, remitente_id: other, destinatario_id: uid, mensaje: 'Revisar asistencia', created_at: '2026-11-26T10:00:00Z', leido_en: i ? '2026-11-26T10:05:00Z' : null, remitente: { nombres: 'Ana', apellidos: 'Perez' }, destinatario: { nombres: 'Luis', apellidos: 'Rojas' } }));
    const reads = [];
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      let body = {};
      if (path.endsWith('/auth/me')) return route.fulfill({ status: 401, json: { error: 'test' } });
      if (path.endsWith('/perfil')) body = { tienda_nombre: 'ARAMBURÚ' };
      else if (path.endsWith('/leido')) {
        const id = Number(path.split('/').at(-2));
        reads.push(id);
        messages.find(m => m.id === id).leido_en = new Date().toISOString();
      } else if (route.request().method() === 'POST') {
        const input = route.request().postDataJSON();
        messages.push({ id: messages.length + 100, tienda_id: input.tienda_id, remitente_id: uid, destinatario_id: other, mensaje: input.mensaje, created_at: '2026-11-26T12:00:00Z', leido_en: null });
      } else if (path.endsWith('/bandeja-zonal-tienda')) {
        const id = Number(url.searchParams.get('tienda_id') || 10);
        body = role === 'jefe_zonal' && !url.searchParams.has('tienda_id') ? { tiendas: stores } : { tienda_id: id, mensajes: messages.filter(m => m.tienda_id === id), documentos: [{ id, tipo_documento: 'Licencia municipal', fecha_vencimiento: '2099-01-01' }] };
      }
      await route.fulfill({ json: body });
    });
    await page.goto(process.env.MAILBOX_AUDIT_URL || 'http://127.0.0.1:5180/');
    const mount = async ({ role, uid }) => {
      const { default: React } = await import('/node_modules/.vite/deps/react.js');
      const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
      const { default: Layout } = await import('/src/components/Layout.jsx');
      const el = document.createElement('div');
      document.body.append(el);
      ReactDOM.createRoot(el).render(React.createElement(Layout, { user: { id: uid, rol: role, nombres: 'Prueba' }, page: 'dashboard', onNavigate: () => {}, onLogout: () => {} }, React.createElement('p', null, 'Inicio')));
    };
    await page.evaluate(mount, { role, uid });
    if (role === 'jefe_zonal') {
      const popup = page.getByRole('dialog');
      await popup.getByRole('heading', { name: 'Tienes 2 mensajes por contestar' }).waitFor();
      assert.equal(await popup.locator('.store-mailbox-startup__messages li').count(), 2);
      assert.equal(await popup.locator('.store-mailbox-startup__documents').count(), 0);
      await popup.getByRole('heading', { name: '3 documentos por vencer', exact: true }).waitFor();
      assert.equal(reads.length, 0);
      await page.screenshot({ path: 'artifacts/bandeja-aviso-inicio.png' });
      await popup.getByRole('button', { name: 'Más tarde' }).click();
      await page.reload();
      await page.evaluate(mount, { role, uid });
      await page.getByRole('dialog').getByRole('heading', { name: 'Tienes 2 mensajes por contestar' }).waitFor();
      await page.getByRole('button', { name: 'Ir a la bandeja' }).click();
    } else {
      const popup = page.getByRole('dialog');
      await popup.getByRole('heading', { name: 'Tienes 1 documento por vencer' }).waitFor();
      assert.ok((await popup.textContent()).includes('Revisa los próximos vencimientos en la bandeja.'));
      assert.equal((await popup.textContent()).includes('Licencia municipal'), false);
      await page.screenshot({ path: 'artifacts/bandeja-aviso-documentos.png' });
      await popup.getByRole('button', { name: 'Más tarde' }).click();
      await page.reload();
      await page.evaluate(mount, { role, uid });
      await page.getByRole('dialog').getByRole('heading', { name: 'Tienes 1 documento por vencer' }).waitFor();
      await page.getByRole('button', { name: 'Ver vencimientos' }).click();
      assert.equal(await page.getByRole('dialog').count(), 0);
    }
    assert.equal(await page.locator('.store-mailbox-trigger').count(), 0);
    await page.getByRole('button', { name: 'Vencimientos' }).click();
    assert.equal(await page.locator('.store-mailbox__document').count(), role === 'jefe_zonal' ? 3 : 1);
    if (role === 'jefe_zonal') {
      const colors = await page.locator('.store-mailbox__document').evaluateAll(rows => rows.map(row => getComputedStyle(row).borderLeftColor));
      assert.equal(colors[0], colors[1]);
    }
    await page.getByRole('button', { name: /^Todos/ }).click();
    assert.equal(await page.locator('.store-mailbox__conversation').count(), role === 'jefe_zonal' ? 2 : 1);
    assert.equal(await page.locator('.store-mailbox__conversation').filter({ hasText: 'AYACUCHO' }).count(), 0);
    await page.getByRole('button', { name: /^Pendientes/ }).click();
    assert.equal(await page.locator('.store-mailbox__conversation').count(), 1);
    await page.getByRole('button', { name: /^Todos/ }).click();
    await page.getByRole('button').filter({ hasText: role === 'jefe_zonal' ? 'Administrador de tienda' : 'Ana Perez' }).first().waitFor();
    assert.equal(reads.length, 0);
    await page.getByRole('button').filter({ hasText: role === 'jefe_zonal' ? 'Administrador de tienda' : 'Ana Perez' }).first().click();
    await page.waitForFunction(() => document.querySelector('.store-mailbox__compose'));
    await page.waitForFunction(() => document.querySelector('.store-mailbox__delivery')?.textContent.includes('Visto'));
    assert.deepEqual(reads, [1]);
    await page.getByRole('button', { name: 'Conversaciones', exact: true }).click();
    await page.getByRole('button', { name: /Vistos/ }).click();
    await page.getByRole('button').filter({ hasText: role === 'jefe_zonal' ? 'Administrador de tienda' : 'Ana Perez' }).first().click();
    await page.getByLabel(/Respuesta pendiente/).fill('Revisado y corregido');
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.store-mailbox__compose label')?.textContent === 'Nuevo mensaje');
    await page.getByRole('button', { name: 'Conversaciones', exact: true }).click();
    await page.getByRole('button', { name: /Respondidos/ }).click();
    assert.equal(await page.locator('.store-mailbox__conversation').count(), 1);
    assert.equal(await page.evaluate(() => document.querySelector('.store-mailbox').scrollWidth > innerWidth), false);
    await page.screenshot({ path: `artifacts/bandeja-${role}.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const sidebarButtons = page.locator('.sidebar nav>button');
    const labels = await sidebarButtons.allTextContents();
    const mailboxIndex = labels.findIndex(label => label.includes('Bandeja de mensajes'));
    assert.ok(mailboxIndex > 0 && mailboxIndex < labels.length - 1);
    await page.screenshot({ path: `artifacts/bandeja-${role}-desktop.png` });
    if (role === 'jefe_zonal') {
      await page.getByRole('button', { name: /^Todos/ }).click();
      await page.getByRole('button', { name: 'Nuevo mensaje', exact: true }).click();
      await page.getByLabel('Destino del nuevo mensaje').selectOption('12');
      await page.getByLabel('Nuevo mensaje', { exact: true }).fill('Primer mensaje a la tienda');
      await page.getByRole('button', { name: 'Enviar', exact: true }).click();
      await page.getByText('Primer mensaje a la tienda', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Conversaciones', exact: true }).click();
      assert.equal(await page.locator('.store-mailbox__conversation').filter({ hasText: 'AYACUCHO' }).count(), 1);
      messages.length = 0;
      await page.reload();
      await page.evaluate(mount, { role, uid });
      const popup = page.getByRole('dialog');
      await popup.getByRole('heading', { name: 'Tienes 3 documentos por vencer' }).waitFor();
      assert.equal(await popup.locator('.store-mailbox-startup__messages').count(), 0);
      assert.equal(await popup.locator('.store-mailbox-startup__documents').count(), 0);
      await popup.getByRole('button', { name: 'Ver vencimientos' }).click();
      assert.equal(await page.locator('.store-mailbox__document').count(), 3);
    }
    console.log(`${role}: aviso de entrada, vencimientos, estilo uniforme, lectura, respuesta y conversaciones iniciadas OK`);
    await page.close();
  }
} finally {
  await browser.close();
}
