import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { stockTransfers, transferTotals } from '../src/commercial/stock-transfers.ts';

import { dashboardNumberFormat } from '../src/commercial/inventory-performance.ts';
import { resolveProductSize } from '../src/commercial/product-sizes.ts';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../src/commercial/dashboard-controller.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('dashboard-controller.ts', source, ts.ScriptTarget.Latest, true);
const app = tree.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'CommercialDashboardController');
const members = app.members.filter(member => member.name?.getText(tree).startsWith('transfer') || ['resetTransferFilters', 'toggleTransferRow', 'normalized', 'number'].includes(member.name?.getText(tree)));
const code = ts.transpileModule(`export class Subject {${members.map(member => member.getText(tree)).join('\n')}}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const signal = initial => {
  let value = initial;
  const get = () => value;
  get.set = next => { value = next; };
  return get;
};
const exports = {};
vm.runInNewContext(code, { exports, signal, computed: fn => fn, stockTransfers, transferTotals, resolveProductSize, dashboardNumberFormat });
const product = (storeId, stockUnits, units30, productId = 'P1', brand = 'ADIDAS', category = 'TEXTIL') => ({ storeId, stockUnits, goodUnits: stockUnits, units30, productId, product: productId === 'P1' ? 'Polo caballero' : 'Zapatilla', brand, category, line: category === 'TEXTIL' ? 'ROPA CABALLERO' : 'CALZADO CABALLERO' });
function fixture() {
  const subject = new exports.Subject();
  subject.predictiveStoreOptions = () => ['A', 'B', 'C'].map(storeId => ({ storeId, alias: storeId, isStore: true }));
  subject.stockDetailLoaded = signal(true);
  subject.stockTransfersLoaded = signal(false);
  subject.storeTransferRoutes = signal(null);
  subject.storeTransferStores = signal([]);
  subject.stockTransferProductsData = signal([]);
  subject.stockProductsData = () => [product('A', 100, 10), product('B', 0, 10), product('C', 12, 20), product('A', 80, 0, 'P2', 'NIKE', 'CALZADO'), product('B', 0, 20, 'P2', 'NIKE', 'CALZADO'), product('OUTSIDE', 1000, 1000)];
  return subject;
}
const totals = subject => ({ ...subject.transferSummary() });

test('brand, line, category, product search and reset update both routes and totals', () => {
  const subject = fixture();
  assert.deepEqual(totals(subject), { stockUnits: 192, salesUnits: 60 });
  subject.transferBrand.set('ADIDAS');
  assert.deepEqual(totals(subject), { stockUnits: 112, salesUnits: 40 });
  subject.transferBrand.set(''); subject.transferRubro.set('CALZADO');
  assert.deepEqual(totals(subject), { stockUnits: 80, salesUnits: 20 });
  subject.transferRubro.set(''); subject.transferLine.set('ROPA CABALLERO');
  assert.deepEqual(totals(subject), { stockUnits: 112, salesUnits: 40 });
  subject.transferLine.set(''); subject.transferSearch.set('P2');
  assert.deepEqual(totals(subject), { stockUnits: 80, salesUnits: 20 });
  subject.resetTransferFilters();
  assert.deepEqual(totals(subject), { stockUnits: 192, salesUnits: 60 });
});

test('choosing a destination preserves available donors and sums only that store', () => {
  const subject = fixture();
  subject.transferStore.set('C');
  assert.equal(subject.transferRecommendations().length, 1);
  assert.equal(subject.transferRecommendations()[0].source, 'A');
  assert.deepEqual(totals(subject), { stockUnits: 12, salesUnits: 20 });
  subject.transferPriority.set('CRITICAL');
  assert.equal(subject.transferRecommendations().length, 0);
  assert.deepEqual(totals(subject), { stockUnits: 0, salesUnits: 0 });
});

test('summary covers all filtered pages and page is clamped when filters reduce the list', () => {
  const subject = fixture();
  subject.stockProductsData = () => Array.from({ length: 12 }, (_, i) => [product('A', 100, 0, `P${i}`), product('B', 0, 20, `P${i}`)]).flat();
  subject.transferPage.set(1);
  assert.equal(subject.transferPageRows().length, 2);
  assert.deepEqual(totals(subject), { stockUnits: 1200, salesUnits: 240 });
  subject.transferSearch.set('P11');
  assert.equal(subject.transferCurrentPage(), 0);
  assert.equal(subject.transferPageRows().length, 1);
  assert.deepEqual(totals(subject), { stockUnits: 100, salesUnits: 20 });
});

test('matrix groups a product and origin with all eligible destinations', () => {
  const subject = fixture();
  subject.transferBrand.set('ADIDAS');
  assert.equal(subject.transferMatrixRows().length, 1);
  const matrix = subject.transferPageRows()[0];
  assert.equal(matrix.origin.source, 'A');
  assert.deepEqual(Array.from(matrix.destinations.keys()), ['B', 'C']);
  assert.deepEqual(Array.from(subject.transferMatrixStores(), store => store.id), ['B', 'C']);
  subject.transferPriority.set('CRITICAL');
  assert.deepEqual(Array.from(subject.transferPageRows()[0].destinations.keys()), ['B']);
});

test('matrix retains Nissei codes and keeps identical product names separate', () => {
  const subject = fixture();
  subject.stockProductsData = () => ['P1', 'P2'].flatMap(id => [
    { ...product('A', 20, 0, id), product: 'Same name', productCode: id === 'P1' ? '000123' : '000124' },
    { ...product('B', 0, 30, id), product: 'Same name', productCode: id === 'P1' ? '000123' : '000124' },
  ]);
  assert.equal(subject.transferMatrixRows().length, 2);
  subject.transferSearch.set('000123');
  assert.equal(subject.transferMatrixRows().length, 1);
  assert.equal(subject.transferMatrixRows()[0].origin.productCode, '000123');
});

test('all inventory categories can be selected with their own lines, brands and transfer totals', () => {
  const subject = fixture();
  const rows = subject.stockProductsData();
  for (const category of ['HOGAR', 'TECNOLOGÍA', 'FERRETERÍA']) {
    rows.push(...[product('A', 50, 0, category, `Marca ${category}`, category), product('B', 0, 10, category, `Marca ${category}`, category)]
      .map(row => ({ ...row, line: `Línea ${category}` })));
  }
  rows.push(product('OUTSIDE', 100, 0, 'OUT', 'Externa', 'SOLO FUERA DEL ALCANCE'));
  subject.stockProductsData = () => rows;
  assert.deepEqual(Array.from(subject.transferRubros()), ['CALZADO', 'FERRETERÍA', 'HOGAR', 'TECNOLOGÍA', 'TEXTIL']);
  for (const category of ['HOGAR', 'TECNOLOGÍA', 'FERRETERÍA']) {
    subject.transferRubro.set(category);
    assert.deepEqual(Array.from(subject.transferLines()), [`Línea ${category}`]);
    assert.deepEqual(Array.from(subject.transferBrands()), [`Marca ${category}`]);
    assert.equal(subject.transferRecommendations().length, 1);
    assert.equal(subject.transferRecommendations()[0].category, category);
    assert.deepEqual(totals(subject), { stockUnits: 50, salesUnits: 10 });
  }
  subject.resetTransferFilters();
  assert.equal(subject.transferRecommendations().length, 6);
});

test('best destination prioritizes coverage then demand and expansion can be toggled', () => {
  const subject = fixture();
  subject.stockProductsData = () => [product('A', 100, 0), product('B', 0, 10), product('C', 0, 30)];
  const row = subject.transferMatrixRows()[0];
  assert.equal(row.best.destination, 'C');
  assert.deepEqual(Array.from(row.options, option => option.destination), ['C', 'B']);
  subject.toggleTransferRow(row.key);
  assert.equal(subject.transferExpandedRow(), row.key);
  subject.toggleTransferRow(row.key);
  assert.equal(subject.transferExpandedRow(), '');
  subject.toggleTransferRow(row.key);
  subject.resetTransferFilters();
  assert.equal(subject.transferExpandedRow(), '');
});

test('size filter matches canonical sizes and keeps missing sizes explicit', () => {
  const subject = fixture();
  subject.transferRubro.set('TEXTIL');
  subject.stockProductsData = () => [
    ...['A', 'B'].map(store => ({ ...product(store, store === 'A' ? 100 : 0, store === 'A' ? 0 : 20, 'P1'), productCode: '1234567890100M' })),
    ...['A', 'B'].map(store => ({ ...product(store, store === 'A' ? 100 : 0, store === 'A' ? 0 : 20, 'P2', 'ADIDAS', 'TEXTIL'), productCode: '1234567890100L' })),
    ...['A', 'B'].map(store => product(store, store === 'A' ? 100 : 0, store === 'A' ? 0 : 20, 'P3')),
  ];
  assert.deepEqual(Array.from(subject.transferSizes()), ['L', 'M', 'Sin talla']);
  subject.transferSize.set('M');
  assert.equal(subject.transferMatrixRows().length, 1);
  assert.equal(subject.transferMatrixRows()[0].origin.productId, 'P1');
  subject.transferSize.set('Sin talla');
  assert.equal(subject.transferMatrixRows()[0].origin.productId, 'P3');
  subject.resetTransferFilters();
  assert.equal(subject.transferSize(), '');
});

test('matrix reset starts without a selected rubro and prefers compact transfer candidates', () => {
  const subject = fixture();
  subject.transferSizeMode.set(true);
  subject.transferRubro.set('CALZADO');
  subject.resetTransferFilters();
  assert.equal(subject.transferRubro(), '');
  const candidates = [product('A', 20, 0), product('B', 0, 10)];
  subject.stockTransfersLoaded.set(true);
  subject.stockTransferProductsData.set(candidates);
  assert.equal(subject.transferProducts().length, 2);
  assert.equal(subject.transferRecommendations()[0].suggested, 10);
});

test('sales and stock chart do not read or calculate transfer data', () => {
  const names = new Set(['sizeRubro', 'shoeSizeSystem', 'sizeMetric', 'selectSizeMetric', 'sizeChartRows']);
  const selected = app.members.filter(member => names.has(member.name?.getText(tree)));
  const compiled = ts.transpileModule(`export class SizeSubject {${selected.map(member => member.getText(tree)).join('\n')}}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const isolated = {};
  let calls = 0;
  vm.runInNewContext(compiled, { exports: isolated, signal, computed: fn => fn, resolveProductSize,
    stockTransfers: () => { calls++; return []; } });
  const subject = new isolated.SizeSubject();
  subject.storeTransferRoutes = () => null;
  subject.sizeSalesPeriod = () => 202610;
  subject.data = () => ({ metadata: { stockCutoff: '2026-10-29' } });
  subject.sizeSalesLoadedKey = () => 'legacy';
  subject.sizeSalesData = () => [];
  subject.sizeRubro.set('TEXTIL');
  subject.sizeProductsForChart = () => [{ productId: 'P1', productCode: '1234567890100M', line: 'DAMA', units30: 5, stockUnits: 20 }];
  subject.sizeTransfersForChart = () => { throw new Error('Transfer data must remain unloaded'); };
  let loads = 0;
  let stockLoads = 0;
  subject.ensureSizeDetail = async () => { stockLoads++; };
  subject.ensureStockTransfers = async () => { loads++; };
  assert.equal(subject.sizeChartRows()[0].sales, 5);
  subject.selectSizeMetric('STOCK');
  assert.equal(subject.sizeChartRows()[0].stock, 20);
  assert.equal(calls, 0);
  assert.equal(loads, 0);
  assert.equal(stockLoads, 1);
  subject.sizeTransfersForChart = () => [];
  subject.selectSizeMetric('TRANSFERS');
  subject.sizeChartRows();
  assert.equal(loads, 1);
  assert.equal(calls, 1);
});
