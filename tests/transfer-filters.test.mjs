import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { stockTransfers, transferTotals } from '../commercial-dashboard/src/app/stock-transfers.ts';

const require = createRequire(new URL('../commercial-dashboard/package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../commercial-dashboard/src/app/app.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('app.ts', source, ts.ScriptTarget.Latest, true);
const app = tree.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'App');
const members = app.members.filter(member => member.name?.getText(tree).startsWith('transfer') || ['resetTransferFilters', 'normalized', 'number'].includes(member.name?.getText(tree)));
const code = ts.transpileModule(`export class Subject {${members.map(member => member.getText(tree)).join('\n')}}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const signal = initial => {
  let value = initial;
  const get = () => value;
  get.set = next => { value = next; };
  return get;
};
const exports = {};
vm.runInNewContext(code, { exports, signal, computed: fn => fn, stockTransfers, transferTotals });
const product = (storeId, stockUnits, units30, productId = 'P1', brand = 'ADIDAS', category = 'TEXTIL') => ({ storeId, stockUnits, goodUnits: stockUnits, units30, productId, product: productId === 'P1' ? 'Polo caballero' : 'Zapatilla', brand, category, line: category === 'TEXTIL' ? 'ROPA CABALLERO' : 'CALZADO CABALLERO' });
function fixture() {
  const subject = new exports.Subject();
  subject.predictiveStoreOptions = () => ['A', 'B', 'C'].map(storeId => ({ storeId, alias: storeId, isStore: true }));
  subject.staticPredictiveProducts = () => [product('A', 100, 10), product('B', 0, 10), product('C', 12, 20), product('A', 80, 0, 'P2', 'NIKE', 'CALZADO'), product('B', 0, 20, 'P2', 'NIKE', 'CALZADO'), product('OUTSIDE', 1000, 1000)];
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
  subject.staticPredictiveProducts = () => Array.from({ length: 12 }, (_, i) => [product('A', 100, 0, `P${i}`), product('B', 0, 20, `P${i}`)]).flat();
  subject.transferPage.set(1);
  assert.equal(subject.transferPageRows().length, 2);
  assert.deepEqual(totals(subject), { stockUnits: 1200, salesUnits: 240 });
  subject.transferSearch.set('P11');
  assert.equal(subject.transferCurrentPage(), 0);
  assert.equal(subject.transferPageRows().length, 1);
  assert.deepEqual(totals(subject), { stockUnits: 100, salesUnits: 20 });
});

test('the three original bar series follow the filtered opportunities', () => {
  const subject = fixture();
  subject.transferBrand.set('ADIDAS');
  const options = subject.transferChartOption();
  assert.deepEqual(Array.from(options.series, series => series.name), ['Stock origen', 'Stock destino', 'Traslado sugerido']);
  assert.deepEqual(Array.from(options.series[0].data), [100, 100]);
  assert.deepEqual(Array.from(options.series[1].data), [0, 12]);
  subject.transferPriority.set('CRITICAL');
  assert.deepEqual(Array.from(subject.transferChartOption().series[0].data), [100]);
});

test('footwear displays and searches its Nissei code with leading zeros, without mixing identical names', () => {
  const subject = fixture();
  const shoe = (store, stock, sales, id, code) => ({ ...product(store, stock, sales, id, 'SKECHERS', 'CALZADO'), product: 'CROCS NIÑO SKECHERS - 402020L-BLLM', productCode: code });
  subject.staticPredictiveProducts = () => [
    shoe('A', 20, 0, 'P_7F5B21313D48A558', '00023C7003'), shoe('B', 0, 15, 'P_7F5B21313D48A558', '00023C7003'),
    shoe('A', 30, 0, 'P_1111111111111111', '00023C7004'), shoe('B', 0, 15, 'P_1111111111111111', '00023C7004'),
  ];
  subject.transferSearch.set('00023c7003');
  assert.equal(subject.transferRecommendations().length, 1);
  assert.equal(subject.transferRecommendations()[0].productCode, '00023C7003');
  const chart = subject.transferChartOption();
  assert.match(chart.yAxis.axisLabel.formatter('0'), /Código: 00023C7003/);
  subject.tooltip = (title, rows) => ({ title, rows });
  const tooltip = chart.tooltip.formatter([{ dataIndex: 0 }]);
  assert.equal(tooltip.rows.find(row => row.label === 'Código Nissei').value, '00023C7003');
  assert.ok(!tooltip.rows.some(row => row.value === 'P_7F5B21313D48A558'));
});
