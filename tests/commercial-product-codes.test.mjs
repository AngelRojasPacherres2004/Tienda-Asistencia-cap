import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogProductId, createProductCodeLookup } from '../netlify/lib/commercial-product-codes.js';

function fixture(failFirst = false) {
  let calls = 0;
  const query = {
    select() { return this; }, eq() { return this; }, order() { return this; },
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
  for (const ids of [undefined, ['402020L-BLLM'], Array(5001).fill('P_1111111111111111')]) {
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
