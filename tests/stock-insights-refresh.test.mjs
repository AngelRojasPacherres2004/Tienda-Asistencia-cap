import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStockInsights, stockInsightsCommonKey } from '../src/commercial/stock-insights-refresh.ts';

const initial = { rowCount: 1, brandRows: [{ name: 'Marca', stockUnits: 100, stockValue: 1000, demandUnits: 20, movementUnits: 50 }], healthRows: [{ status: 'ÓPTIMO', value: 1000, products: 1 }], projectionRows: [], riskRows: [], priorityProducts: [] };
test('a horizon change preserves the identity of unrelated chart datasets', () => {
  const next = structuredClone(initial);
  next.riskRows = [{ storeId: 'A', totalValue: 1000, riskValue: 600, riskProducts: 1, products: 1 }];
  const result = mergeStockInsights(initial, next);
  assert.equal(result.brandRows, initial.brandRows);
  assert.equal(result.healthRows, initial.healthRows);
  assert.notEqual(result.riskRows, initial.riskRows);
  assert.equal(result.riskRows[0].riskValue, 600);
  assert.equal(initial.riskRows.length, 0);
});
test('shared filter changes update their affected data and initial results are accepted', () => {
  const next = structuredClone(initial);
  next.brandRows[0].demandUnits = 45;
  const result = mergeStockInsights(initial, next);
  assert.notEqual(result.brandRows, initial.brandRows);
  assert.equal(result.brandRows[0].demandUnits, 45);
  assert.equal(mergeStockInsights(null, next), next);
});
test('only a horizon change belongs to projection-only refresh', () => {
  const filters = { storeIds: ['A'], rubros: ['TEXTIL'], windowDays: 30, horizonDays: 0 };
  assert.equal(stockInsightsCommonKey(filters), stockInsightsCommonKey({ ...filters, horizonDays: 90 }));
  assert.notEqual(stockInsightsCommonKey(filters), stockInsightsCommonKey({ ...filters, windowDays: 60 }));
  assert.notEqual(stockInsightsCommonKey(filters), stockInsightsCommonKey({ ...filters, storeIds: ['B'] }));
});
