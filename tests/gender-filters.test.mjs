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
const names = ['genderFromLine', 'genderSublineRows', 'genderSublineOptions', 'genderActiveSubline', 'genderSummary', 'setGenderRubro', 'setGenderSubline'];
const code = ts.transpileModule(`export class Subject {${app.members.filter(member => names.includes(member.name?.getText(tree))).map(member => member.getText(tree)).join('\n')}}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(code, { exports, computed: read => read, GENDER_ORDER: ['DAMA', 'CABALLERO'], GENDER_COLORS: {},
  sum: (rows, key) => rows.reduce((sum, row) => sum + (row[key] || 0), 0),
  grouped: (rows, key) => { const groups = new Map(); for (const row of rows) { const k = key(row); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(row); } return groups; } });
const signal = initial => { let value = initial; const read = () => value; read.set = next => { value = next; }; return read; };

test('rubro y sublínea actualizan venta, unidades y porcentajes sin mezclar agregados', () => {
  const rows = [
    { storeId: 'T001', category: 'TEXTIL', line: 'ROPA DAMA', subline: 'POLOS', net: 100, units: 2 },
    { storeId: 'T001', category: 'TEXTIL', line: 'ROPA CABALLERO', subline: 'POLOS', net: 300, units: 6 },
    { storeId: 'T001', category: 'TEXTIL', line: 'ROPA DAMA', subline: 'BLUSAS', net: 200, units: 4 },
    { storeId: 'T001', category: 'CALZADO', line: 'CALZADO DAMA', subline: 'ZAPATILLAS', net: 400, units: 2 },
    { storeId: 'T002', category: 'CALZADO', line: 'CALZADO DAMA', subline: 'BOTAS', net: 999, units: 1 },
  ];
  const subject = Object.assign(new exports.Subject(), { genderRubros: signal(['TEXTIL', 'CALZADO']), genderSubline: signal(''),
    expandedChart: signal('gender'), sublineDetailLoaded: signal(true), filteredStoreIds: () => ['T001'], selectedPeriods: () => [202609],
    dateRangeActive: () => false, monthlySublineIndex: 'sublines', monthlyLineIndex: 'lines', normalized: value => value.toUpperCase(),
    indexedRows: (index, _periods, ids) => rows.filter(row => ids.includes(row.storeId))
      .map(row => index === 'sublines' ? row : { ...row, subline: undefined }) });
  assert.equal(subject.genderSummary().reduce((sum, row) => sum + row.net, 0), 1000);
  subject.setGenderRubro('TEXTIL');
  assert.equal(subject.genderSublineOptions().join(','), 'BLUSAS,POLOS');
  subject.setGenderSubline('POLOS');
  assert.equal(subject.genderSummary().find(row => row.name === 'DAMA').share, 0.25);
  assert.equal(subject.genderSummary().find(row => row.name === 'CABALLERO').units, 6);
  subject.setGenderRubro('CALZADO');
  assert.equal(subject.genderSubline(), '');
  assert.equal(subject.genderSublineOptions().join(','), 'ZAPATILLAS');
  subject.setGenderSubline('BOTAS');
  assert.equal(subject.genderSubline(), '');
  assert.equal(subject.genderSummary()[0].net, 400);
  subject.setGenderRubro(''); subject.setGenderSubline('POLOS');
  subject.expandedChart.set(null);
  assert.equal(subject.genderSummary().reduce((sum, row) => sum + row.net, 0), 1000);
});
