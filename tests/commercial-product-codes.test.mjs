import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PRODUCT_CODE_IDS, catalogProductId, createProductCodeLookup } from '../netlify/lib/commercial-product-codes.js';

function fixture(failFirst = false) {
  let calls = 0;
  const query = {
    select() { return this; }, order() { return this; },
    async range() {
      calls++;
      if (failFirst && calls === 1) return { error: new Error('offline') };
      return { data: [{ codigo_nissei: '00023C7003' }, { codigo_nissei: '00023C7004' }] };
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
  assert.equal(calls(), 1);
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

test('looks up codes from every category across all catalog pages', async () => {
  const rows = Array.from({ length: 3501 }, (_, index) => ({ codigo_nissei: `000${index}ABC`, rubro: index > 999 ? 'FERRETERÍA' : 'CALZADO' }));
  const query = {
    select() { return this; }, order() { return this; },
    async range(from, to) { return { data: rows.slice(from, to + 1) }; },
  };
  const lookup = createProductCodeLookup({ from: () => query });
  const codes = [rows[0].codigo_nissei, rows[1000].codigo_nissei, rows[3500].codigo_nissei];
  assert.deepEqual(await lookup(codes.map(catalogProductId)), Object.fromEntries(codes.map(code => [catalogProductId(code), code])));
});
