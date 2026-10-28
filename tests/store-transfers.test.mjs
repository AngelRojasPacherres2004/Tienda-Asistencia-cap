import test from 'node:test';
import assert from 'node:assert/strict';
import { storeTransferOpportunities } from '../netlify/lib/store-transfers.js';

const compact = {
  encoding: 'stock-v1', stores: ['A', 'B', 'C', 'D'],
  products: [['SKU1', 'CODE1', 'Producto', 'TEXTIL', 'DAMA', '', 'Marca'], ['SKU2', 'CODE2', 'Otro', 'CALZADO', '', '', 'Marca']],
  // goodUnits and units30, with the same stock-v1 mask as the published files.
  rows: [[0, 0, 100, 18, 100, 0], [1, 0, 0, 18, 0, 30], [2, 1, 50, 18, 50, 0], [3, 1, 0, 18, 0, 20]],
};

test('store admin receives incoming opportunities computed across stores', () => {
  const result = storeTransferOpportunities(compact, ['B']);
  assert.equal(result.routes.length, 1);
  assert.equal(result.routes[0].source, 'A');
  assert.equal(result.routes[0].destination, 'B');
  assert.equal(result.routes[0].suggested, 30);
  assert.deepEqual(result.products.map(row => row.storeId), ['A', 'B']);
});

test('store admin sees outgoing routes and never unrelated stock or routes', () => {
  const result = storeTransferOpportunities(compact, ['A']);
  assert.equal(result.routes.length, 1);
  assert(result.routes.every(row => row.source === 'A' || row.destination === 'A'));
  assert(result.products.every(row => row.productId === 'SKU1'));
  assert.deepEqual(storeTransferOpportunities(compact, ['UNKNOWN']), { routes: [], products: [] });
});

test('supports the product rows used by older published releases', () => {
  const products = [
    { storeId: 'A', productId: 'SKU', product: 'Producto', category: 'TEXTIL', line: '', goodUnits: 50, stockUnits: 50, units30: 0 },
    { storeId: 'B', productId: 'SKU', product: 'Producto', category: 'TEXTIL', line: '', goodUnits: 0, stockUnits: 0, units30: 10 },
  ];
  assert.equal(storeTransferOpportunities(products, ['B']).routes[0].suggested, 10);
});
