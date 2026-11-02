import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { aggregateStoreMetrics, stockExtremes, aggregateSellerRanking, dashboardNumberFormat } from '../src/commercial/inventory-performance.ts';

export const sum = (rows, field) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
export function grouped(rows, key) {
  const groups = new Map();
  for (const row of rows) { const name = key(row); const bucket = groups.get(name); if (bucket) bucket.push(row); else groups.set(name, [row]); }
  return groups;
}
export function previousStores(rows) {
  return new Map([...grouped(rows, row => row.storeId)].map(([id, items]) => [id, {
    count: items.length, stockUnits: sum(items, 'stockUnits'), stockValue: sum(items, 'stockValue'),
    units30: sum(items, 'units30'), sales30: sum(items, 'sales30'),
    goodUnits: items.reduce((total, row) => total + (row.goodUnits || 0), 0),
    hasStateBreakdown: items.some(row => row.goodUnits != null || row.mermaStockUnits != null || row.desmedroStockUnits != null),
  }]));
}
export function previousExtremes(rows) {
  const values = [...grouped(rows, row => `${row.productId}|${row.product}`)].map(([key, items]) => ({
    name: key.split('|').slice(1).join('|'), units: sum(items, 'stockUnits'), value: sum(items, 'stockValue'),
  })).filter(row => row.units > 0).sort((a, b) => b.units - a.units);
  return { high: values.slice(0, 3), low: [...values].sort((a, b) => a.units - b.units).slice(0, 3) };
}
export function previousSellers(rows) {
  return [...grouped(rows, row => row.seller || 'SIN VENDEDOR')].map(([seller, items]) => ({
    seller, net: sum(items, 'net'), units: sum(items, 'units'), transactions: sum(items, 'transactions'),
  })).filter(row => row.net !== 0).sort((a, b) => b.net - a.net);
}
const products = Array.from({ length: 142055 }, (_, i) => ({
  productId: `P${i % 50000}`, product: `Producto ${i % 50000}`, storeId: `T${i % 18}`,
  stockUnits: i % 39 - 2, stockValue: (i % 503) * 1.17, units30: i % 17, sales30: (i % 73) * 2.31,
  goodUnits: i % 5 ? i % 29 : undefined,
  seller: i % 11 ? `V${i % 1200}` : '', net: i % 31 ? (i % 83) * 3.19 : -24, units: i % 13, transactions: i % 7,
}));
for (const rows of [[], products, products.filter(row => row.storeId === 'T1'), products.slice(0, 2000),
  [{ productId: 'A', product: 'Tie|name', stockUnits: 5, stockValue: 1 }, { productId: 'B', product: 'Tie', stockUnits: 5, stockValue: 2 }]]) {
  assert.deepStrictEqual(stockExtremes(rows), previousExtremes(rows));
}
for (const rows of [[], products, products.slice(0, 1000)]) {
  assert.deepStrictEqual(aggregateStoreMetrics(rows), previousStores(rows));
  assert.deepStrictEqual(aggregateSellerRanking(rows), previousSellers(rows));
}
for (const number of [0, -0, 1.234, -123.45, 1234567.89]) {
  assert.equal(dashboardNumberFormat.format(number), new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(number));
}
function measure(fn) {
  for (let i = 0; i < 2; i++) fn();
  const times = [];
  for (let i = 0; i < 7; i++) { const start = performance.now(); fn(); times.push(performance.now() - start); }
  return +times.sort((a, b) => a - b)[3].toFixed(2);
}
const cases = [
  ['Cobertura y rotacion (datos compartidos)', () => { previousStores(products); previousStores(products); }, () => aggregateStoreMetrics(products)],
  ['Mayor/menor stock', () => previousExtremes(products), () => stockExtremes(products)],
  ['Ranking vendedores', () => previousSellers(products), () => aggregateSellerRanking(products)],
  ['Formato de 1000 numeros', () => { for (let i = 0; i < 1000; i++) new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(i * 1.1); },
    () => { for (let i = 0; i < 1000; i++) dashboardNumberFormat.format(i * 1.1); }],
];
const results = cases.map(([name, before, after]) => {
  const beforeMs = measure(before), afterMs = measure(after);
  return { name, beforeMs, afterMs, reductionPct: +(100 * (1 - afterMs / beforeMs)).toFixed(1) };
});
console.log(JSON.stringify({ dataset: 'synthetic', rows: products.length, repetitions: 7, statistic: 'median', parity: 'exact', results }, null, 2));
