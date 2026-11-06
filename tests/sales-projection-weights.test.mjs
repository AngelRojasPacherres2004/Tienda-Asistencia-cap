import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');
const source = readFileSync(new URL('../src/commercial/dashboard-controller.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('controller.ts', source, ts.ScriptTarget.Latest, true);
const controller = tree.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'CommercialDashboardController');
const method = controller.members.find(n => n.name?.getText(tree) === 'salesProjection');
const code = ts.transpileModule(`export class Subject { ${method.getText(tree)} }`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(code, { exports, sum: (rows, key) => rows.reduce((total, row) => total + row[key], 0) });

test('el cierre suma el promedio mensual sin ajustar por tendencia y distingue cero de ausencia', () => {
  const subject = new exports.Subject();
  subject.year = () => 2026;
  subject.activeMonths = () => [10];
  subject.selectedMonths = () => [10];
  subject.filteredStoreIds = () => new Set(['store']);
  subject.data = () => ({ metadata: { salesCutoff: '2026-10-31' } });
  const amounts = new Map([[202601, 1000], [202511, 200], [202411, 400], [202512, 0], [202412, 600]]);
  subject.rowsForPeriods = periods => periods.filter(p => amounts.has(p)).map(p => ({net: amounts.get(p)}));
  assert.equal(subject.salesProjection(0).value, 1600);
  amounts.delete(202512);
  assert.equal(subject.salesProjection(0).value, 1900);
  amounts.delete(202412);
  assert.equal(subject.salesProjection(0).value, null);
});

for (const partial of [false, true]) {
  test(`los pesos suman 100% y un ritmo constante conserva el cierre anual (parcial: ${partial})`, () => {
    for (let month = 1; month <= 12; month++) {
      const subject = new exports.Subject();
      const day = partial ? 15 : new Date(2026, month, 0).getDate();
      const cutoff = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      subject.year = () => 2026;
      subject.activeMonths = () => [month];
      subject.selectedMonths = () => partial ? [] : [month];
      subject.filteredStoreIds = () => new Set(['store']);
      subject.data = () => ({ metadata: { salesCutoff: cutoff } });
      subject.rowsForPeriods = periods => periods.map(period => {
        const year = Math.floor(period / 100), m = period % 100;
        const days = new Date(2026, m, 0).getDate();
        return { net: 100 * (year === 2026 && m === month ? day : days) };
      });
      const result = subject.salesProjection(0);
      assert.ok(Math.abs(Object.values(result.weights).reduce((a, b) => a + b, 0) - 1) < 1e-12);
      const expected = result.ytdForecast * result.weights.ytd + result.seasonalForecast * result.weights.seasonal + result.runRateForecast * result.weights.runRate;
      assert.ok(Math.abs(result.value - expected) < 1e-8);
      if (!partial) assert.ok(Math.abs(result.value - 36500) < 1e-8, `mes ${month}: ${result.value}`);
    }
  });
}
