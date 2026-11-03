import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const domain = readFileSync(new URL('../netlify/domains/commercial.js', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../src/commercial/dashboard-controller.ts', import.meta.url), 'utf8');

test('las metas comerciales no tienen fallback a JSON, Storage o la publicación', () => {
  assert.doesNotMatch(domain, /metas-comerciales\.json|readCommercialGoalsDocument|writeCommercialGoalsDocument/);
  const storeGoals = domain.slice(domain.indexOf('async function commercialStoreGoals'), domain.indexOf('function commercialGoalsYear'));
  assert.doesNotMatch(storeGoals, /commercialCompanyRanking|dashboard\.json|storage\./);
  assert.match(storeGoals, /metas_comerciales_tienda/);
  assert.match(storeGoals, /metas_comerciales_anuales/);
});

test('la meta general se lee de annualGoalOverrides y no de monthlyStore', () => {
  const annualTarget = controller.slice(controller.indexOf('readonly companyAnnualTarget'), controller.indexOf('readonly primaryKpiModel'));
  assert.match(annualTarget, /annualGoalOverrides/);
  assert.doesNotMatch(annualTarget, /monthlyStore|dashboard\.json/);
});

test('la tarjeta META cambia al contexto de mes, tienda y rubro', () => {
  const contextual = controller.slice(controller.indexOf('readonly contextualGoalTarget'), controller.indexOf('readonly primaryKpiModel'));
  assert.match(contextual, /selectedMonths/);
  assert.match(contextual, /targetForPeriods/);
  assert.match(contextual, /categoryFilterLabel/);
  assert.match(contextual, /storeFilterLabel/);
});

test('el tráfico respeta el corte comercial y conserva meses sin cobertura en Supabase', () => {
  const load = controller.slice(controller.indexOf('const salesCutoff = loaded.metadata.salesCutoff'), controller.indexOf("} else if (trafficResult.status === 'rejected')"));
  assert.match(load, /row\.date <= salesCutoff/);
  assert.match(load, /databaseMonths/);
  assert.match(load, /publishedDaily/);
  assert.match(load, /mergedDaily/);
});

test('la brecha acumulada compara meta al corte contra venta neta acumulada', () => {
  const gap = controller.slice(controller.indexOf('readonly accumulatedGap'), controller.indexOf('readonly talentProfiles'));
  assert.match(gap, /metrics\.targetYtd\s*-\s*metrics\.net/);
  assert.doesNotMatch(gap, /projectedClose/);
});
