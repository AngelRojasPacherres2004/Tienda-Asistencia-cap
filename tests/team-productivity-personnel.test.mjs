import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { signal, computed } from '../src/commercial/reactivity-react.ts';

const ts = createRequire(import.meta.url)('typescript');
const source = readFileSync(new URL('../src/commercial/dashboard-controller.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('controller.ts', source, ts.ScriptTarget.Latest, true);
const controller = tree.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'CommercialDashboardController');
const names = ['talentAreaPersonnelRows', 'talentAreaRows', 'talentTeamProductivityRows', 'talentTeamProductivityOption', 'talentTrafficRows', 'areaHead'];
const fields = controller.members.filter(node => names.includes(node.name?.getText(tree)));
const code = ts.transpileModule(`export class Subject {${fields.map(node => node.getText(tree)).join('\n')}}`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const grouped = (rows, key) => {
  const result = new Map();
  for (const row of rows) { const k = key(row); result.set(k, [...(result.get(k) || []), row]); }
  return result;
};
const exports = {};
vm.runInNewContext(code, { exports, computed, grouped, sum: (rows, key) => rows.reduce((n, row) => n + row[key], 0), C: { gold: '#abc' } });

function fixture() {
  const s = new exports.Subject();
  s.period = signal(202602);
  s.stores = signal(['A']);
  s.categories = signal([]);
  s.monthlyPersonnelAreaIndex = [
    { periodId: 202601, storeId: 'A', area: 'TEXTIL', personnel: 20 },
    { periodId: 202602, storeId: 'A', area: 'TEXTIL', personnel: 4 },
    { periodId: 202602, storeId: 'B', area: 'TEXTIL', personnel: 2 },
    { periodId: 202602, storeId: 'A', area: 'CALZADO', personnel: 3 },
  ];
  s.monthlyLineIndex = [
    { periodId: 202601, storeId: 'A', category: 'TEXTIL', net: 800 },
    { periodId: 202602, storeId: 'A', category: 'TEXTIL', net: 1600 },
    { periodId: 202602, storeId: 'B', category: 'TEXTIL', net: 400 },
    { periodId: 202602, storeId: 'A', category: 'CALZADO', net: 600 },
    { periodId: 202602, storeId: 'A', category: 'HOGAR', net: 100 },
  ];
  s.selectedPeriod = () => s.period();
  s.selectedPeriods = () => new Set([202601, s.period()]);
  s.filteredStoreIds = () => s.stores();
  s.personnelCategories = () => s.categories();
  s.categoryMatches = category => !s.categories().length || s.categories().includes(category);
  s.personnelAreaMatchesCategory = (row, category) => row.area === category;
  s.normalized = value => String(value || '').toUpperCase();
  s.indexedRows = (rows, periods, ids) => rows.filter(row => [...periods].includes(row.periodId) && [...ids].includes(row.storeId));
  s.dateRangeActive = signal(false);
  s.dailyRowsForSelection = () => [{ category: 'TEXTIL', net: 200 }];
  s.selectedSublines = () => [];
  s.genderMatches = s.lineMatches = s.sublineMatches = () => true;
  s.money = s.number = value => value;
  s.tooltip = (title, values) => ({ title, values });
  return s;
}

test('usa la dotación del mismo mes que distribución por área, sin promediar meses', () => {
  const s = fixture();
  const textil = s.talentTeamProductivityRows().find(row => row.team === 'TEXTIL');
  assert.equal(textil.personnel, s.talentAreaRows().find(row => row.area === 'TEXTIL').personnel);
  assert.equal(textil.personnel, 4);
  assert.equal(textil.averageMonthlySales, 1200);
  assert.equal(textil.productivity, 300);
  assert.ok(!s.talentTeamProductivityRows().some(row => row.team === 'HOGAR'));
  s.period.set(202601);
  assert.equal(s.talentTeamProductivityRows()[0].personnel, 20);
});

test('ambas gráficas respetan filtros de tienda y área', () => {
  const s = fixture();
  s.stores.set(['A', 'B']);
  assert.equal(s.talentTeamProductivityRows().find(row => row.team === 'TEXTIL').personnel, 6);
  s.categories.set(['CALZADO']);
  assert.equal(s.talentAreaRows().length, 1);
  assert.equal(s.talentTeamProductivityRows().length, 1);
  assert.equal(s.talentTeamProductivityRows()[0].personnel, 3);
});

test('el rango diario conserva la misma dotación y el tooltip identifica el dato del área', () => {
  const s = fixture();
  s.dateRangeActive.set(true);
  const row = s.talentTeamProductivityRows()[0];
  assert.equal(row.personnel, 4);
  assert.equal(row.productivity, row.averageMonthlySales / 4);
  const tooltip = s.talentTeamProductivityOption().tooltip.formatter([{ dataIndex: 0 }]);
  assert.equal(tooltip.values[1].label, 'Colaboradores del área');
  assert.equal(tooltip.values[1].value, 4);
});


test('trafico por tienda suma el periodo mensual y distingue cero de falta de registros', () => {
  const s = fixture();
  s.data = () => ({});
  s.filteredStoreIds = () => new Set(s.stores());
  s.filteredStores = () => s.stores().map(storeId => ({ storeId, alias: storeId }));
  s.fromDate = () => '2026-02-01'; s.toDate = () => '2026-02-02';
  s.monthlyStoreIndex = [
    { storeId: 'A', periodId: 202601, traffic: 10 },
    { storeId: 'A', periodId: 202602, traffic: 20 },
    { storeId: 'B', periodId: 202602, traffic: 50 },
    { storeId: 'C', periodId: 202602, traffic: 0 },
  ];
  s.stores.set(['A', 'B', 'C', 'D']);
  const totals = Object.fromEntries(s.talentTrafficRows().map(row => [row.storeId, row.traffic]));
  assert.deepEqual(totals, { B: 50, A: 30, C: 0, D: null });
  s.stores.set(['A']);
  assert.equal(s.talentTrafficRows().length, 1);
  assert.equal(s.talentTrafficRows()[0].traffic, 30);
});

test('trafico diario respeta fechas y acceso a tiendas sin multiplicar trafico por rubro', () => {
  const s = fixture();
  s.data = () => ({});
  s.filteredStoreIds = () => new Set(['A']);
  s.filteredStores = () => [{ storeId: 'A', alias: 'A' }];
  s.fromDate = () => '2026-02-01'; s.toDate = () => '2026-02-02';
  s.dailyTrafficRows = [
    { storeId: 'A', date: '2026-02-01', traffic: 10 },
    { storeId: 'A', date: '2026-02-02', traffic: 20 },
    { storeId: 'A', date: '2026-02-03', traffic: 100 },
    { storeId: 'B', date: '2026-02-01', traffic: 500 },
  ];
  s.dateRangeActive.set(true);
  assert.equal(s.talentTrafficRows()[0].traffic, 30);
});
