import test from 'node:test';
import assert from 'node:assert/strict';
import { stockTransfers, transferTotals } from '../src/commercial/stock-transfers.ts';
const row = (storeId, goodUnits, units30, productId = 'SKU1') => ({ storeId, goodUnits, stockUnits: goodUnits, units30, units90: units30 * 3, productId, product: 'Producto', category: 'TEXTIL', line: 'DAMA' });
test('matches the same SKU and reserves healthy stock for the donor', () => {
  const result = stockTransfers([row('A', 100, 10), row('B', 2, 30), row('C', 0, 20, 'SKU2')]);
  assert.equal(result.length, 1);
  assert.equal(result[0].suggested, 58);
  assert.equal(result[0].critical, true);
  assert.equal(result[0].source, 'A');
  assert.equal(result[0].destination, 'B');
});
test('does not allocate donor stock twice and prioritizes the most urgent store', () => {
  const result = stockTransfers([row('A', 20, 0), row('B', 0, 15), row('C', 1, 20)]);
  assert.equal(result[0].destination, 'B');
  assert.equal(result.reduce((n, r) => n + r.suggested, 0), 20);
  assert.equal(result.length, 1);
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
  assert.deepEqual(stockTransfers([row('A', 100, 0), row('B', 60, 30)]), []);
});
test('marks legacy stock as estimated and caps suggestions at sellable units', () => {
  const donor = row('A', 10, 0);
  delete donor.goodUnits;
  const result = stockTransfers([donor, row('B', 0, 30)]);
  assert.equal(result[0].estimated, true);
  assert.equal(result[0].suggested, 8);
});

test('totals do not repeat a donor shared by multiple transfer routes', () => {
  const products = [row('A', 100, 10), row('B', 0, 10), row('C', 12, 20)];
  const routes = stockTransfers(products);
  assert.equal(routes.length, 2);
  assert.deepEqual(transferTotals(products, routes), { stockUnits: 112, salesUnits: 120 });
});

test('totals follow priority and selected-store filters without losing the opposite side of a route', () => {
  const products = [row('A', 100, 10), row('B', 0, 10), row('C', 12, 20)];
  const routes = stockTransfers(products);
  assert.deepEqual(transferTotals(products, routes.filter(r => r.critical)), { stockUnits: 112, salesUnits: 120 });
  assert.deepEqual(transferTotals(products, routes.filter(r => r.destination === 'C'), 'C'), { stockUnits: 12, salesUnits: 60 });
  assert.deepEqual(transferTotals(products, []), { stockUnits: 0, salesUnits: 0 });
});

test('totals include all source quantities when one product/store has several rows', () => {
  const products = [row('A', 10, 0), row('A', 15, 0), row('B', 0, 30)];
  assert.deepEqual(transferTotals(products, stockTransfers(products)), { stockUnits: 25, salesUnits: 90 });
});

test('alternative mode shows destinations even when the first would exhaust the donor', () => {
  const products = [row('A', 10, 0), row('B', 0, 20), row('C', 1, 30)];
  assert.equal(stockTransfers(products).length, 1);
  const alternatives = stockTransfers(products, 30, 90, false);
  assert.equal(alternatives.length, 2);
  assert.deepEqual(alternatives.map(route => route.destination), ['B', 'C']);
  assert.ok(alternatives.every(route => route.suggested === 10));
  assert.deepEqual(transferTotals(products, alternatives), { stockUnits: 11, salesUnits: 150 });
});


test('coverage and priority use actual 90-day sales even when 30-day demand differs', () => {
  const donor = { ...row('A', 100, 90), units90: 0 };
  const receiver = { ...row('B', 20, 300), units90: 90 };
  const [route] = stockTransfers([donor, receiver]);
  assert.equal(route.destinationDays, 20);
  assert.equal(route.destinationSales, 90);
  assert.equal(route.critical, true);
  assert.equal(route.suggested, 40);
  assert.deepEqual(transferTotals([donor, receiver], [route]), { stockUnits: 120, salesUnits: 90 });
});

test('missing 90-day sales never substitutes 30-day sales', () => {
  const receiver = row('B', 0, 100);
  delete receiver.units90;
  assert.deepEqual(stockTransfers([row('A', 100, 0), receiver]), []);
});


test('default priorities cover 30 days as critical and 30 to 60 as alert', () => {
  const donor = row('A', 500, 0);
  for (const [days, critical] of [[0, true], [30, true], [31, false], [59, false]]) {
    const [route] = stockTransfers([donor, row('B', days, 30)]);
    assert.equal(route.destinationDays, days);
    assert.equal(route.critical, critical);
    assert.equal(route.suggested, 60 - days);
  }
  assert.deepEqual(stockTransfers([donor, row('B', 60, 30)]), []);
});
