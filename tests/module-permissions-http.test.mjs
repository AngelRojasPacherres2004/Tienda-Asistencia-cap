import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { memoryPostgrest, supportFixture } from './helpers/store-support-db.mjs';

process.env.SUPABASE_URL = 'https://store-support.invalid';
process.env.SUPABASE_SECRET_KEY = 'test-only-service-key';
process.env.JWT_SECRET = 'module-permissions-http-test-only';
const { handler } = await import('../netlify/functions/api.js');

function setup() {
  const data = supportFixture();
  const commercial = { id: 7, nombres: 'Comercial', apellidos: 'Prueba', usuario: 'comercial4', password: 'existing-password', rol: 'gerente_comercial', estado: 'activo', tienda_id: null, suspendido_sistemas: false, acceso_solo_resumen_comercial: false, cambio_credenciales_pendiente: false, credenciales_actualizadas_en: null };
  const systems = { ...commercial, id: 8, usuario: 'sistemas', rol: 'sistemas' };
  data.usuarios.push(commercial, systems);
  data.commercial_user_scopes.push({ usuario_id: 7, scope_type: 'all', scope_value: null });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = memoryPostgrest(data);
  const token = account => jwt.sign(account, process.env.JWT_SECRET, { expiresIn: '5m' });
  const invoke = (path, cookie, method = 'GET', body) => handler({ path: `/api${path}`, httpMethod: method,
    headers: { cookie: `asiste_session=${cookie}` }, queryStringParameters: {}, body: body ? JSON.stringify(body) : null });
  return { data, commercial, systems, token, invoke, restore: () => { globalThis.fetch = originalFetch; } };
}

const parsed = response => JSON.parse(response.body);

test('HTTP usa el permiso actual aunque la cookie antigua diga false y auth/me actualiza el menú', async () => {
  const fixture = setup();
  const { commercial, systems, token, invoke } = fixture;
  const oldCookie = token(commercial);
  const systemsCookie = token(systems);
  try {
    assert.equal((await invoke('/usuarios', oldCookie)).statusCode, 200);
    const updated = await invoke('/systems/module-permissions/7', systemsCookie, 'PATCH', { summaryOnly: true });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.equal(parsed(updated).account.acceso_solo_resumen_comercial, true);
    const denied = await invoke('/usuarios', oldCookie);
    assert.equal(denied.statusCode, 403, denied.body);
    assert.equal(parsed(denied).code, 'ACCOUNT_ACCESS_CHANGED');
    assert.equal((await invoke('/commercial/access', oldCookie)).statusCode, 200);
    for (const [path, method] of [['/commercial-goals', 'PUT'], ['/commercial/transfer-groups', 'PATCH']]) {
      assert.equal((await invoke(path, oldCookie, method, {})).statusCode, 403);
    }
    const me = await invoke('/auth/me', oldCookie);
    assert.equal(me.statusCode, 200, me.body);
    assert.equal(parsed(me).user.acceso_solo_resumen_comercial, true);
    assert.ok(me.headers['Set-Cookie']);
    const restrictedCookie = me.headers['Set-Cookie'].match(/asiste_session=([^;]+)/)[1];
    assert.equal((await invoke('/systems/module-permissions/7', oldCookie, 'PATCH', { summaryOnly: false })).statusCode, 403);
    const reset = await invoke('/systems/module-permissions/7', systemsCookie, 'PATCH', { summaryOnly: false });
    assert.equal(reset.statusCode, 200, reset.body);
    assert.equal((await invoke('/usuarios', restrictedCookie)).statusCode, 200);
    const refreshed = await invoke('/auth/me', restrictedCookie);
    assert.equal(parsed(refreshed).user.acceso_solo_resumen_comercial, false);
    assert.equal(commercial.password, 'existing-password');
  } finally { fixture.restore(); }
});

test('HTTP permite el cambio obligatorio de credenciales manteniendo la restricción', async () => {
  const fixture = setup();
  const { commercial, token, invoke } = fixture;
  try {
    commercial.acceso_solo_resumen_comercial = true;
    commercial.cambio_credenciales_pendiente = true;
    const pendingCookie = token(commercial);
    const changed = await invoke('/auth/change-credentials', pendingCookie, 'POST', {
      usuario: 'comercial.nuevo', password: 'ClaveNuevaSegura123!', confirmarPassword: 'ClaveNuevaSegura123!',
    });
    assert.equal(changed.statusCode, 200, changed.body);
    assert.equal(parsed(changed).user.acceso_solo_resumen_comercial, true);
    assert.equal(parsed(changed).user.cambio_credenciales_pendiente, false);
    assert.notEqual(commercial.password, 'existing-password');
    const nextCookie = changed.headers['Set-Cookie'].match(/asiste_session=([^;]+)/)[1];
    assert.equal((await invoke('/commercial/access', nextCookie)).statusCode, 200);
    assert.equal((await invoke('/usuarios', nextCookie)).statusCode, 403);
  } finally { fixture.restore(); }
});
