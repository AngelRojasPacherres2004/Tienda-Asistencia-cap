import test from 'node:test';
import assert from 'node:assert/strict';
import { commercialStockInsights } from '../netlify/lib/commercial-stock-insights.js';

const access = { storeIds: ['A', 'B'] };
const release = { stock_cutoff: '2026-07-31' };
const filters = {
  storeIds: ['A'], rubros: ['TEXTIL'], lines: [], sublines: [],
  windowDays: 30, movementDays: 90, healthyDays: 30,
  overstockDays: 90, mermaPct: 2, horizonDays: 0,
};

test('a store outside the session scope never reaches the database', async () => {
  let calls = 0;
  const db = { rpc() { calls++; return { data: {} }; } };
  await assert.rejects(commercialStockInsights(db, access, release, { ...filters, storeIds: ['A', 'X'] }),
    error => error.status === 403);
  assert.equal(calls, 0);
});

test('the backend binds the published cutoff and bounded filters', async () => {
  let received;
  const db = { async rpc(name, params) { received = { name, params }; return { data: { rowCount: 1 }, error: null }; } };
  assert.deepEqual(await commercialStockInsights(db, access, release, filters), { rowCount: 1 });
  assert.equal(received.name, 'dashboard_stock_insights');
  assert.equal(received.params.p_cutoff, '2026-07-31');
  assert.deepEqual(received.params.p_store_ids, ['A']);
  assert.deepEqual(received.params.p_rubros, ['TEXTIL']);
});

test('invalid rubros and oversized results are rejected', async () => {
  const db = { async rpc() { return { data: { value: 'x'.repeat(5_000_000) }, error: null }; } };
  await assert.rejects(commercialStockInsights(db, access, release, { ...filters, rubros: ['HOGAR'] }),
    error => error.status === 400);
  await assert.rejects(commercialStockInsights(db, access, release, { ...filters, storeIds: ['B'] }),
    error => error.status === 503);
});

test('multiple stores are queried separately and chart aggregates preserve totals', async () => {
  const calls = [];
  const perStore = store => ({
    rowCount: store === 'A' ? 2 : 3,
    brandRows: [{ name: 'MARCA', stockUnits: store === 'A' ? 4 : 6, stockValue: store === 'A' ? 40 : 60, demandUnits: 2, movementUnits: 3 }],
    healthRows: [{ status: 'ALERTA', value: store === 'A' ? 30 : 50, products: store === 'A' ? 2 : 3 }],
    projectionRows: [{ status: 'CRÍTICO', value: store === 'A' ? 30 : 50, products: store === 'A' ? 2 : 3 }],
    riskRows: [{ storeId: store, totalValue: 30, riskValue: 10, riskProducts: 1, products: 2 }],
    priorityProducts: [{ storeId: store, product: store, status: store === 'A' ? 'ALERTA' : 'CRÍTICO', coverageDays: 2, vendibleValue: 20 }],
  });
  const db = { async rpc(_name, params) {
    calls.push(params.p_store_ids);
    return { data: perStore(params.p_store_ids[0]), error: null };
  } };
  const result = await commercialStockInsights(db, access, release, { ...filters, storeIds: ['A', 'B'] });
  assert.deepEqual(calls, [['A'], ['B']]);
  assert.equal(result.rowCount, 5);
  assert.deepEqual(result.brandRows[0], { name: 'MARCA', stockUnits: 10, stockValue: 100, demandUnits: 4, movementUnits: 6 });
  assert.deepEqual(result.healthRows[0], { status: 'ALERTA', value: 80, products: 5 });
  assert.equal(result.riskRows.length, 2);
  assert.deepEqual(result.priorityProducts.map(row => row.storeId), ['B', 'A']);
});
