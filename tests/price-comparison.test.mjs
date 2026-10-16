import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { comparePriceBands, summarizePriceBands } from '../commercial-dashboard/src/app/price-comparison.ts';
import { adaptiveValueScale } from '../commercial-dashboard/src/app/chart-scale.ts';

test('cada rango conserva montos, unidades, participación por año y variaciones', () => {
  const rows = comparePriceBands([{ bandOrder: 1, net: 100, units: 10 }, { bandOrder: 2, net: 300, units: 10 }],
    [{ bandOrder: 1, net: 50, units: 5 }, { bandOrder: 2, net: 150, units: 5 }]);
  assert.equal(rows.length, 11);
  assert.equal(rows[0].actual.share, 0.25);
  assert.equal(rows[0].comparison.share, 0.25);
  assert.equal(rows[0].actual.averagePrice, 10);
  assert.equal(rows[0].saleChange, 1);
  assert.equal(rows[0].unitsChange, 1);
  assert.equal(rows[2].comparison.net, 0);
  assert.equal(rows[2].saleChange, null);
});
test('distingue falta de registros de un cero medido y evita porcentajes infinitos', () => {
  const absent = comparePriceBands([{ bandOrder: 1, net: 10, units: 1 }], []);
  assert.equal(absent[0].comparison.available, false);
  assert.equal(absent[0].saleChange, null);
  const zero = comparePriceBands([{ bandOrder: 1, net: 10, units: 1 }], [{ bandOrder: 1, net: 0, units: 0 }]);
  assert.equal(zero[0].comparison.available, true);
  assert.equal(zero[0].saleChange, null);
  assert.equal(zero[0].comparison.averagePrice, null);
  assert.equal(summarizePriceBands([{ net: 999, units: 1 }])[0].available, false);
});

const require = createRequire(new URL('../commercial-dashboard/package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../commercial-dashboard/src/app/app.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('app.ts', source, ts.ScriptTarget.Latest, true);
const app = tree.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'App');
const names = ['priceComparisonYears', 'priceComparisonYear', 'priceComparisonActive', 'priceComparisonRows', 'priceRangeOption', 'expandedPriceComparisonOption'];
const code = ts.transpileModule(`export class Subject {${app.members.filter(member => names.includes(member.name?.getText(tree))).map(member => member.getText(tree)).join('\n')}}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(code, { exports, computed: read => read, comparePriceBands, adaptiveValueScale, C: { purple: '#6d28d9' } });
const signal = initial => { let value = initial; const read = () => value; read.set = next => { value = next; }; return read; };
const fixture = () => {
  const rows = [
    { periodId: 202601, storeId: 'T001', category: 'CALZADO', bandOrder: 1, net: 100, units: 10 },
    { periodId: 202501, storeId: 'T001', category: 'CALZADO', bandOrder: 1, net: 50, units: 5 },
    { periodId: 202401, storeId: 'T001', category: 'CALZADO', bandOrder: 1, net: 40, units: 4 },
    { periodId: 202502, storeId: 'T001', category: 'CALZADO', bandOrder: 1, net: 999, units: 99 },
    { periodId: 202501, storeId: 'T002', category: 'CALZADO', bandOrder: 1, net: 999, units: 99 },
    { periodId: 202501, storeId: 'T001', category: 'TEXTIL', bandOrder: 1, net: 999, units: 99 },
  ];
  return Object.assign(new exports.Subject(), { priceRangeData: () => rows, year: signal(2026), activeMonths: () => [1],
    filteredStoreIds: () => new Set(['T001']), priceComparisonSelectedYear: signal(null), dateRangeActive: signal(false), expandedChart: signal('price-range'),
    indexedRows: (_index, periods, ids) => rows.filter(row => periods.has(row.periodId) && ids.has(row.storeId)),
    categoryMatches: category => category === 'CALZADO', genderMatches: () => true, lineMatches: () => true, sublineMatches: () => true,
    priceRangeSummary: () => summarizePriceBands(rows.slice(0, 1)), short: value => String(value), money: value => String(value), number: value => String(value), percent: value => String(value), tooltip: (_title, fields) => JSON.stringify(fields),
  });
};
test('gráfico ampliado usa dos barras sin apilar, dos líneas y los mismos filtros en ambos años', () => {
  const subject = fixture();
  const chart = subject.priceRangeOption();
  assert.equal(subject.priceComparisonYear(), 2025);
  assert.equal(chart.series.length, 4);
  assert.equal(chart.series[0].type, 'bar');
  assert.equal(chart.series[1].type, 'bar');
  assert.equal(chart.series[0].stack, undefined);
  assert.equal(chart.series[1].stack, undefined);
  assert.equal(chart.series[0].data[0], 100);
  assert.equal(chart.series[1].data[0], 50);
  assert.equal(chart.series[2].type, 'line');
  assert.equal(chart.series[3].type, 'line');
  assert.equal(chart.series[2].yAxisIndex, 1);
  assert.equal(chart.series[3].yAxisIndex, 1);
  assert.equal(chart.series[2].data[0], 10);
  assert.equal(chart.series[3].data[0], 5);
  assert.notEqual(chart.series[2].lineStyle.color, chart.series[3].lineStyle.color);
  subject.priceComparisonSelectedYear.set(2024);
  assert.equal(subject.priceRangeOption().series[1].data[0], 40);
  assert.equal(subject.priceRangeOption().series[3].data[0], 4);
});
test('la comparación se limita a la vista ampliada y no compara datos mensuales con un solo día', () => {
  const subject = fixture();
  subject.expandedChart.set(null);
  assert.equal(subject.priceRangeOption().series.length, 2);
  subject.expandedChart.set('price-range');
  subject.priceComparisonSelectedYear.set(0);
  assert.equal(subject.priceRangeOption().series.length, 2);
  subject.priceComparisonSelectedYear.set(null);
  subject.dateRangeActive.set(true);
  assert.equal(subject.priceComparisonActive(), false);
  subject.dateRangeActive.set(false);
  subject.year.set(2025);
  assert.equal(subject.priceComparisonYear(), 2024);
});
