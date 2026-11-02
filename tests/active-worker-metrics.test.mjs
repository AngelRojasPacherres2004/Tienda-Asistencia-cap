import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { signal, computed } from '../src/commercial/reactivity-react.ts';
import { activeWorkerMetrics, workerRoleLabel } from '../src/commercial/active-worker-metrics.ts';

const worker = (fields = {}) => ({ storeId: 'AYA', name: 'Persona', role: 'vendedor', gender: 'N/A', birthDate: null, ...fields });

test('género y edades usan los datos disponibles sin repartir los desconocidos', () => {
  const result = activeWorkerMetrics([
    worker({ gender: 'M', birthDate: '2000-11-03' }),
    worker({ gender: 'F', birthDate: '1990-11-02' }), worker(),
    worker({ birthDate: '2000-02-30' }), worker({ birthDate: '2030-01-01' }),
  ], '2026-11-02', 11);
  assert.equal(result.male, 1);
  assert.equal(result.female, 1);
  assert.equal(result.unknownGender, 3);
  assert.equal(result.ageCount, 2);
  assert.equal(result.averageAge, 30.5);
  assert.equal(result.missingBirthDates, 3);
  assert.deepEqual(result.birthdays.map(row => row.day), [2, 3]);
});

test('un padrón sin fechas devuelve edad no disponible y ningún cumpleaños inventado', () => {
  const result = activeWorkerMetrics([worker()], '2026-11-02', 11);
  assert.equal(result.averageAge, null);
  assert.equal(result.birthdays.length, 0);
  assert.equal(workerRoleLabel('jefe_tienda'), 'ADMINISTRADOR DE TIENDA');
});

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../src/commercial/dashboard-controller.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('dashboard-controller.ts', source, ts.ScriptTarget.Latest, true);
const controller = tree.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'CommercialDashboardController');
const field = controller.members.find(node => node.name?.getText(tree) === 'talentKpiModel');
const code = ts.transpileModule(`export class Subject {${field.getText(tree)}}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(code, { exports, computed, activeWorkerMetrics, workerRoleLabel,
  grouped: (rows, key) => { const groups = new Map(); for (const row of rows) { const k = key(row); groups.set(k, [...(groups.get(k) || []), row]); } return groups; },
  sum: (rows, key) => rows.reduce((total, row) => total + row[key], 0),
});

function setup() {
  const subject = new exports.Subject();
  subject.people = signal({ activeWorkers: [worker({ role: 'seguridad' }), worker({ role: 'jefe_tienda' }), worker({ storeId: 'OTRA' })] });
  subject.role = signal('jefe_tienda');
  subject.operationalSummary = subject.people;
  subject.cloud = { accessProfile: () => ({ roleCode: subject.role() }) };
  subject.filteredStoreIds = () => new Set(['AYA']);
  subject.filteredStores = () => [{ storeId: 'AYA', alias: 'AYA' }];
  subject.yearRows = () => [{ storeId: 'AYA', net: 900 }];
  subject.metrics = () => ({ net: 900, personnel: 8 });
  subject.selectedMonth = () => 11;
  subject.birthdayMonthRows = () => [];
  subject.number = (value, suffix = '') => value == null ? 'N/A' : `${value}${suffix}`;
  subject.money = value => value == null ? 'N/A' : String(value);
  return subject;
}

test('las tarjetas usan los activos de la tienda y actualizan el denominador al cambiar el personal', () => {
  const s = setup();
  assert.equal(s.talentKpiModel().totalWorkers, '2');
  assert.equal(s.talentKpiModel().saleCollaborator, '450');
  assert.equal(s.talentKpiModel().workerRoles[0].role, 'ADMINISTRADOR DE TIENDA');
  s.people.set({ activeWorkers: [worker()] });
  assert.equal(s.talentKpiModel().saleCollaborator, '900');
  s.people.set(null);
  assert.equal(s.talentKpiModel().totalWorkers, 'N/A');
  assert.equal(s.talentKpiModel().gender, 'N/A');
  assert.equal(s.talentKpiModel().birthdays, 'N/A');
});

test('tienda más productiva solo está habilitada para gerente comercial y coach', () => {
  const s = setup();
  for (const role of ['jefe_tienda', 'asistente_tienda', 'jefe_zonal', '']) {
    s.role.set(role);
    assert.equal(s.talentKpiModel().showTopStore, false);
  }
  for (const role of ['gerente_comercial', 'coach']) {
    s.role.set(role);
    assert.equal(s.talentKpiModel().showTopStore, true);
    assert.equal(s.talentKpiModel().topStore, 'AYA');
  }
});
