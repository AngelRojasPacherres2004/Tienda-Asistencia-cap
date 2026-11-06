import test from 'node:test';
import assert from 'node:assert/strict';
import { storeTransferOpportunities as calculateOpportunities } from '../netlify/lib/store-transfers.js';

function storeTransferOpportunities(compact, stores) {
  const rows = Array.isArray(compact) ? compact : compact.rows.map(v => ({ storeId: compact.stores[v[0]], productId: compact.products[v[1]][0], units30: v[5] }));
  return calculateOpportunities(compact, stores, rows.map(r => ({ ...r, units90: r.units30 * 3 })));
}

const compact = {
  encoding: 'stock-v1', stores: ['A', 'B', 'C', 'D'],
  products: [['SKU1', 'CODE1', 'Producto', 'TEXTIL', 'DAMA', '', 'Marca'], ['SKU2', 'CODE2', 'Otro', 'CALZADO', '', '', 'Marca']],
  // goodUnits and units30, with the same stock-v1 mask as the published files.
  rows: [[0, 0, 100, 18, 100, 0], [1, 0, 0, 18, 0, 30], [2, 1, 50, 18, 50, 0], [3, 1, 0, 18, 0, 20]],
};

test('store admin never receives other stores outgoing products even when they arrive at their store', () => {
  const result = storeTransferOpportunities(compact, ['B']);
  assert.deepEqual(result, { routes: [], products: [] });
});

test('store admin sees outgoing routes and never unrelated stock or routes', () => {
  const result = storeTransferOpportunities(compact, ['A']);
  assert.equal(result.routes.length, 1);
  assert(result.routes.every(row => row.source === 'A'));
  assert(result.products.every(row => row.productId === 'SKU1'));
  assert.deepEqual(storeTransferOpportunities(compact, ['UNKNOWN']), { routes: [], products: [] });
});

test('supports the product rows used by older published releases', () => {
  const products = [
    { storeId: 'A', productId: 'SKU', product: 'Producto', category: 'TEXTIL', line: '', goodUnits: 50, stockUnits: 50, units30: 0 },
    { storeId: 'B', productId: 'SKU', product: 'Producto', category: 'TEXTIL', line: '', goodUnits: 0, stockUnits: 0, units30: 10 },
  ];
  assert.equal(storeTransferOpportunities(products, ['A']).routes[0].suggested, 20);
});


test('joins real 90-day demand by store and product before filtering access', () => {
  const predictive = { encoding: 'predictive-v1', note: '', dictionary: { storeId: ['A', 'B'], productId: ['SKU1'] }, rows: [[0, 0, 0], [1, 0, 3, 60, 180]] };
  const result = calculateOpportunities(compact, ['A'], predictive);
  assert.equal(result.routes.length, 1);
  assert.equal(result.routes[0].destinationSales, 180);
  assert.equal(result.routes[0].suggested, 100);
  assert.equal(result.products.find(r => r.storeId === 'B').units90, 180);
});

test('refuses to calculate 90-day transfers without the historical source', () => {
  assert.throws(() => calculateOpportunities(compact, ['B']), /90/);
});
