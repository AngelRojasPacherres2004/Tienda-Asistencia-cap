import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(new URL('../commercial-dashboard/package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../commercial-dashboard/src/app/app.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('app.ts', source, ts.ScriptTarget.Latest, true);
const app = tree.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'App');
const names = ['stockOriginDetailAllRows', 'stockOriginStoreOptions', 'stockOriginCategoryOptions', 'stockOriginLineOptions',
  'stockOriginDetailRows', 'stockOriginDetailTotals', 'clearStockOriginFilters', 'setStockOriginStore', 'setStockOriginCategory', 'openStockOriginDetail'];
const code = ts.transpileModule(`export class Subject {${app.members.filter(member => names.includes(member.name?.getText(tree))).map(member => member.getText(tree)).join('\n')}}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(code, { exports, computed: read => read, requestAnimationFrame: () => {},
  sum: (rows, key) => rows.reduce((sum, row) => sum + row[key], 0),
  grouped: (rows, key) => { const groups = new Map(); for (const row of rows) { const k = key(row); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(row); } return groups; } });
const signal = initial => { let value = initial; const read = () => value; read.set = next => { value = next; }; return read; };
const fixture = () => Object.assign(new exports.Subject(), {
  stockOriginDetailPeriod: signal(202603), stockOriginDetailStore: signal(''), stockOriginDetailCategory: signal(''), stockOriginDetailLine: signal(''),
  data: () => ({ stores: [{ storeId: 'A', store: 'Alfa' }, { storeId: 'B', store: 'Beta' }] }),
  selectedStockOrigins: () => [
    { originPeriodId: 202603, storeId: 'A', category: 'CALZADO', line: 'CALZADO DAMA', subline: 'ZAPATILLAS', units: 10, value: 1000 },
    { originPeriodId: 202603, storeId: 'A', category: 'CALZADO', line: 'CALZADO DAMA', subline: 'ZAPATILLAS', units: 5, value: 500 },
    { originPeriodId: 202603, storeId: 'A', category: 'TEXTIL', line: 'ROPA DAMA', subline: 'POLOS', units: 20, value: 200 },
    { originPeriodId: 202603, storeId: 'B', category: 'CALZADO', line: 'CALZADO CABALLERO', subline: 'ZAPATILLAS', units: 30, value: 300 },
    { originPeriodId: 202602, storeId: 'A', category: 'CALZADO', line: 'CALZADO DAMA', subline: 'ZAPATILLAS', units: 999, value: 9990 },
  ], expandedChart: () => null, toggleChartExpansion: () => {},
});

test('filtros en cascada conservan el mes de origen y recalculan los totales de la lista', () => {
  const subject = fixture();
  assert.equal(subject.stockOriginDetailRows().length, 3);
  assert.equal(subject.stockOriginDetailTotals().units, 65);
  subject.setStockOriginStore('A');
  assert.equal(subject.stockOriginDetailTotals().units, 35);
  assert.equal(subject.stockOriginCategoryOptions().join(','), 'CALZADO,TEXTIL');
  subject.setStockOriginCategory('CALZADO');
  assert.equal(subject.stockOriginLineOptions().join(','), 'CALZADO DAMA');
  subject.stockOriginDetailLine.set('CALZADO DAMA');
  assert.equal(subject.stockOriginDetailTotals().value, 1500);
  subject.setStockOriginCategory('TEXTIL');
  assert.equal(subject.stockOriginDetailLine(), '');
  assert.equal(subject.stockOriginDetailTotals().units, 20);
  subject.setStockOriginStore('B');
  assert.equal(subject.stockOriginDetailCategory(), '');
  assert.equal(subject.stockOriginDetailTotals().units, 30);
  assert.equal(subject.stockOriginCategoryOptions().join(','), 'CALZADO');
  subject.clearStockOriginFilters();
  assert.equal(subject.stockOriginDetailTotals().units, 65);
  assert.equal(subject.stockOriginDetailTotals().value, 2000);
});
test('abrir otra barra limpia la selección anterior de la lista', () => {
  const subject = fixture();
  subject.setStockOriginStore('B'); subject.setStockOriginCategory('CALZADO'); subject.stockOriginDetailLine.set('CALZADO CABALLERO');
  subject.openStockOriginDetail({ data: { period: 202602 } });
  assert.equal(subject.stockOriginDetailStore(), '');
  assert.equal(subject.stockOriginDetailCategory(), '');
  assert.equal(subject.stockOriginDetailLine(), '');
  assert.equal(subject.stockOriginDetailPeriod(), 202602);
  assert.equal(subject.stockOriginDetailTotals().units, 999);
});
