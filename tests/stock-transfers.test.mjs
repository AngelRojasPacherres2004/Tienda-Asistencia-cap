import test from 'node:test';
import assert from 'node:assert/strict';
import { stockTransfers } from '../commercial-dashboard/src/app/stock-transfers.ts';
const row = (storeId, goodUnits, units30, productId = 'SKU1') => ({ storeId, goodUnits, stockUnits: goodUnits, units30, productId, product: 'Producto', category: 'TEXTIL', line: 'DAMA' });
test('matches the same SKU and reserves healthy stock for the donor', () => {
  const result = stockTransfers([row('A', 100, 10), row('B', 2, 30), row('C', 0, 20, 'SKU2')]);
  assert.equal(result.length, 1);
  assert.equal(result[0].suggested, 28);
  assert.equal(result[0].critical, true);
  assert.equal(result[0].source, 'A');
  assert.equal(result[0].destination, 'B');
});
test('does not allocate donor stock twice and prioritizes the most urgent store', () => {
  const result = stockTransfers([row('A', 20, 0), row('B', 0, 15), row('C', 1, 20)]);
  assert.equal(result[0].destination, 'B');
  assert.equal(result.reduce((n, r) => n + r.suggested, 0), 20);
  assert.equal(result[1].suggested, 5);
});
test('ignores unsellable stock, missing SKU and stores without demand', () => {
  assert.deepEqual(stockTransfers([row('A', 0, 0), row('B', 0, 20)]), []);
  assert.deepEqual(stockTransfers([row('A', 50, 0), row('B', 0, 0)]), []);
  assert.deepEqual(stockTransfers([row('A', 50, 0, ''), row('B', 0, 20, '')]), []);
});
test('aggregates duplicate SKU/store rows before allocating', () => {
  const result = stockTransfers([row('A', 10, 0), row('A', 10, 0), row('B', 0, 30)]);
  assert.equal(result.length, 1);
  assert.equal(result[0].sourceStock, 20);
  assert.equal(result[0].suggested, 20);
});
test('does not drain a healthy store or refill a store with enough coverage', () => {
  assert.deepEqual(stockTransfers([row('A', 30, 30), row('B', 0, 30)]), []);
  assert.deepEqual(stockTransfers([row('A', 100, 0), row('B', 30, 30)]), []);
});
test('marks legacy stock as estimated and caps suggestions at sellable units', () => {
  const donor = row('A', 10, 0);
  delete donor.goodUnits;
  const result = stockTransfers([donor, row('B', 0, 30)]);
  assert.equal(result[0].estimated, true);
  assert.equal(result[0].suggested, 8);
});
