import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const ts = createRequire(import.meta.url)('typescript');
const source = readFileSync(new URL('../src/commercial/dashboard-controller.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('controller.ts', source, ts.ScriptTarget.Latest, true);
const controller = tree.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'CommercialDashboardController');
const names = ['isFullCompanyScope', 'goalContextHasFilters', 'contextualGoalTarget', 'targetForPeriods', 'isFullYear'];
const code = ts.transpileModule(`export class Subject {${controller.members.filter(n => names.includes(n.name?.getText(tree))).map(n => n.getText(tree)).join('\n')}}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(code, { exports, computed: fn => fn });
function fixture(scope) {
  const s = new exports.Subject();
  s.cloud = { accessProfile: () => scope ? { scopeType: scope } : null };
  for (const field of ['selectedClusters','selectedFormats','selectedStores','selectedCategories','selectedGenders','selectedLines','selectedSublines','selectedMonths']) s[field] = () => [];
  s.dateRangeActive = () => false; s.storeGoalsReady = () => true;
  s.year = () => 2026; s.rangePeriods = (a,b) => Array.from({length:b-a+1},(_,i)=>a+i);
  s.filteredStoreIds = () => new Set(['EMA']);
  s.storeGoalOverrides = () => Array.from({length:12},(_,i)=>({storeId:'EMA',periodId:202601+i,target:100})).concat([{storeId:'OTHER',periodId:202601,target:9000}]);
  s.annualGoalOverrides = () => [{year:2026,target:70858940.92}];
  s.companyAnnualTarget = () => 70858940.92;
  return s;
}
test('Emancipación sin filtros manuales usa solo sus metas anuales, también para cumplimiento',()=>{
  const s=fixture('store');
  assert.equal(s.isFullCompanyScope(),false);
  assert.equal(s.contextualGoalTarget(),1200);
  assert.equal(s.targetForPeriods(s.rangePeriods(202601,202612)),1200);
  s.selectedMonths=()=>[2]; s.selectedPeriods=()=>new Set([202602]);
  assert.equal(s.contextualGoalTarget(),100);
});
test('el acceso zonal y un acceso todavía no cargado nunca usan meta corporativa',()=>{
  for(const scope of ['cluster','none',null]) assert.equal(fixture(scope).contextualGoalTarget(),1200);
});
test('meta corporativa solo se usa con acceso general sin filtros',()=>{
  const s=fixture('all'); assert.equal(s.contextualGoalTarget(),70858940.92);
  s.selectedStores=()=>['EMA']; assert.equal(s.contextualGoalTarget(),1200);
});
test('espera las metas y no sustituye una meta de tienda ausente por la corporativa',()=>{
  const s=fixture('store'); s.storeGoalsReady=()=>false; assert.equal(s.contextualGoalTarget(),null);
  s.storeGoalsReady=()=>true; s.storeGoalOverrides=()=>[]; assert.equal(s.contextualGoalTarget(),0);
});
