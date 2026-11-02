import { readFileSync } from 'node:fs';
import { resolveProductSize } from '../src/commercial/product-sizes.ts';
import { stockTransfers } from '../src/commercial/stock-transfers.ts';
import { decodeSizeCompact, decodeStockCompact } from '../src/commercial/compact-dashboard.ts';

const root = new URL('../dashboard-data/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const all = read('dashboard-stock-products.json').stockProducts;
const transfers = decodeStockCompact(read('dashboard-stock-transfers.json').stockCompact);
let failed = false;

function summary(products, transferProducts, rubro, system) {
  const mapped = new Map();
  const ids = new Map();
  for (const row of products) {
    const size = resolveProductSize(row, rubro, system);
    if (!size) continue;
    const key = `${size.sort}|${size.label}`;
    const record = mapped.get(key) || { sales: 0, stock: 0, transfers: 0, sku: new Set() };
    record.sales += row.units30;
    record.stock += row.stockUnits;
    record.sku.add(row.productId);
    mapped.set(key, record);
  }
  for (const row of stockTransfers(transferProducts)) {
    const size = resolveProductSize(row, rubro, system);
    if (!size) continue;
    mapped.get(`${size.sort}|${size.label}`).transfers += row.suggested;
  }
  for (const row of products) ids.set(row.productId, row);
  return { total: ids.size, mapped: [...ids.values()].filter(row => resolveProductSize(row, rubro, system)).length,
    rows: [...mapped].map(([key, value]) => [key, value.sales, value.stock, value.transfers, value.sku.size]).sort() };
}

for (const rubro of ['TEXTIL', 'CALZADO']) {
  const slim = decodeSizeCompact(read(`dashboard-stock-sizes-${rubro.toLowerCase()}.json`).sizeCompact);
  const full = all.filter(row => row.category === rubro);
  const candidate = transfers.filter(row => row.category === rubro);
  for (const system of ['USA', 'EUR']) {
    const actual = summary(slim, candidate, rubro, system);
    const expected = summary(full, full, rubro, system);
    const equal = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(`${equal ? 'OK' : 'ERROR'} ${rubro} ${system}: ${slim.length} filas, ${actual.total} SKU, ${actual.mapped} mapeados`);
    failed ||= !equal;
  }
}
if (failed) process.exitCode = 1;
