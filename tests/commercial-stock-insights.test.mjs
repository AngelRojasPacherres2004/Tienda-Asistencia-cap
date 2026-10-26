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
