import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonnelDomain } from '../netlify/domains/personnel.js';

function setup(allStores, stores = []) {
  const domain = createPersonnelDomain({
    supabase: { from: table => {
      const query = { select: () => query, eq: () => query,
        single: async () => ({ data: { acceso_todas_tiendas: allStores } }) };
      assert.ok(['usuarios', 'marketing_tiendas'].includes(table));
      return query;
    } },
    readAllResult: async () => ({ data: stores.map(tienda_id => ({ tienda_id })) }),
    dbError: error => error,
    httpError: (message, status) => Object.assign(new Error(message), { status }),
  });
  return id => domain.resolveStoreScope({ id: 1, rol: 'marketing' }, id);
}

test('Marketing con acceso global permite consolidado y tienda seleccionada', async () => {
  const scope = setup(true);
  assert.equal(await scope(), null);
  assert.equal(await scope('7'), 7);
});

test('Marketing restringido conserva su alcance y rechaza tiendas ajenas', async () => {
  const scope = setup(false, [4, 7]);
  assert.deepEqual(await scope(), [4, 7]);
  assert.equal(await scope('7'), 7);
  await assert.rejects(scope('9'), { status: 403 });
  await assert.rejects(scope('invalid'), { status: 400 });
  assert.deepEqual(await setup(false)(), []);
});
