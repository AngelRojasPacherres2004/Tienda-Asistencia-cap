import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { memoryPostgrest, supportFixture } from './helpers/store-support-db.mjs';

process.env.SUPABASE_URL = 'https://store-support.invalid';
process.env.SUPABASE_SECRET_KEY = 'test-only-service-key';
process.env.JWT_SECRET = 'mailbox-test-only';
const { handler } = await import('../netlify/functions/api.js');

test('zonal ve vencimientos de sus tiendas y no puede consultar otra zona', async () => {
  const data = supportFixture();
  for (const store of data.tiendas) store.cluster = { jefe_zonal_id: 1 };
  const future = '2099-01-01';
  data.documentos_municipales = [
    { id: 1, tienda_id: 10, tipo_documento: 'Licencia', fecha_vencimiento: future, dias_alerta: 99999 },
    { id: 2, tienda_id: 20, tipo_documento: 'Certificado', fecha_vencimiento: future, dias_alerta: 99999 },
    { id: 3, tienda_id: 30, tipo_documento: 'Otra zona', fecha_vencimiento: future, dias_alerta: 99999 },
  ];
  const original = globalThis.fetch;
  const requests = [];
  const memoryFetch = memoryPostgrest(data);
  globalThis.fetch = (input, init) => { requests.push(String(input)); return memoryFetch(input, init); };
  const token = jwt.sign(data.usuarios[0], process.env.JWT_SECRET, { expiresIn: '5m' });
  const invoke = store => handler({ path: '/api/bandeja-zonal-tienda', httpMethod: 'GET', headers: { cookie: `asiste_session=${token}` }, queryStringParameters: store ? { tienda_id: String(store) } : {} });
  try {
    const list = await invoke();
    assert.equal(list.statusCode, 200, list.body);
    assert.deepEqual(JSON.parse(list.body).tiendas.map(store => store.id), [10, 20]);
    for (const id of [10, 20]) {
      const response = await invoke(id);
      assert.equal(response.statusCode, 200, response.body);
      assert.deepEqual(JSON.parse(response.body).documentos.map(document => document.tienda_id), [id]);
    }
    const denied = await invoke(30);
    assert.equal(denied.statusCode, 403, denied.body);
    const documentRequests = requests.filter(url => url.includes('/documentos_municipales?'));
    assert.equal(documentRequests.length, 2);
    assert.deepEqual(documentRequests.map(url => new URL(url).searchParams.get('tienda_id')), ['eq.10', 'eq.20']);
  } finally { globalThis.fetch = original; }
});
