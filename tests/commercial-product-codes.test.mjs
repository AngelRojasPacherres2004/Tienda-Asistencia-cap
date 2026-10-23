import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PRODUCT_CODE_IDS, PRODUCT_CODE_QUERY_BATCH, catalogProductId, createProductCodeLookup } from '../netlify/lib/commercial-product-codes.js';

function fixture(failFirst = false) {
  let calls = 0;
  const codes = ['00023C7003', '00023C7004'];
  const query = {
    select() { return this; },
    async in(_column, ids) {
      calls++;
      if (failFirst && calls === 1) return { error: new Error('offline') };
      return { data: codes.map(codigo_nissei => ({ codigo_nissei, codigo_portal_id: catalogProductId(codigo_nissei) }))
        .filter(row => ids.includes(row.codigo_portal_id)) };
    },
  };
  return { lookup: createProductCodeLookup({ from: () => query }), calls: () => calls };
}

test('resolves only requested exact product IDs and preserves leading zeros', async () => {
  const { lookup, calls } = fixture();
  const first = catalogProductId('00023C7003');
  const second = catalogProductId('00023C7004');
  assert.deepEqual(await lookup([first, first, 'P_FFFFFFFFFFFFFFFF']), { [first]: '00023C7003' });
  assert.deepEqual(await lookup([second]), { [second]: '00023C7004' });
  assert.equal(calls(), 2);
  assert.equal(catalogProductId(' 00023c7003.0 '), first);
});

test('rejects malformed and oversized requests before reading the catalog', async () => {
  const { lookup, calls } = fixture();
  for (const ids of [undefined, ['402020L-BLLM'], Array(MAX_PRODUCT_CODE_IDS + 1).fill('P_1111111111111111')]) {
    await assert.rejects(lookup(ids), error => error.status === 400);
  }
  assert.equal(calls(), 0);
});

test('a failed catalog read can be retried', async () => {
  const { lookup } = fixture(true);
  const id = catalogProductId('00023C7003');
  await assert.rejects(lookup([id]), /offline/);
  assert.deepEqual(await lookup([id]), { [id]: '00023C7003' });
});

test('queries only the requested hashes in bounded batches', async () => {
  const rows = Array.from({ length: PRODUCT_CODE_QUERY_BATCH + 3 }, (_, index) => {
    const codigo_nissei = String(index).padStart(14, '0');
    return { codigo_nissei, codigo_portal_id: catalogProductId(codigo_nissei) };
  });
  const batches = [];
  const query = {
    select() { return this; },
    async in(column, ids) {
      batches.push({ column, ids });
      return { data: rows.filter(row => ids.includes(row.codigo_portal_id)) };
    },
  };
  const lookup = createProductCodeLookup({ from: () => query });
  const ids = rows.map(row => row.codigo_portal_id);
  const result = await lookup(ids);
  assert.equal(Object.keys(result).length, rows.length);
  assert.equal(batches.length, 2);
  assert.ok(batches.every(batch => batch.column === 'codigo_portal_id' && batch.ids.length <= PRODUCT_CODE_QUERY_BATCH));
});
