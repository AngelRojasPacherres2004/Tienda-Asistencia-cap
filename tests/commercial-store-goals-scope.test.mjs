import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommercialDomain } from '../netlify/domains/commercial.js';
import { commercialAccess } from '../netlify/lib/commercial-access.js';
import { aggregateCommercialGoalTotals } from '../netlify/lib/commercial-goals.js';

test('el endpoint conserva las metas de tienda y mes aunque exista una meta corporativa mayor', async () => {
  const tables = {
    usuarios: [{ id: 1, rol: 'jefe_tienda', estado: 'activo', tienda_id: 10 }],
    commercial_user_scopes: [{ usuario_id: 1, scope_type: 'store', scope_value: 'EMA' }],
    commercial_store_map: [{ tienda_id: 10, dashboard_store_id: 'EMA' }, { tienda_id: 20, dashboard_store_id: 'OTHER' }],
    metas_comerciales_anuales: [{ anio: 2026, meta_venta: 70858940.92 }],
    metas_comerciales_tienda: [
      { tienda_id: 10, anio: 2026, mes: 1, rubro: 'TEXTIL', meta_venta: 100 },
      { tienda_id: 10, anio: 2026, mes: 1, rubro: 'CALZADO', meta_venta: 200 },
      { tienda_id: 10, anio: 2026, mes: 2, rubro: 'TEXTIL', meta_venta: 400 },
      { tienda_id: 20, anio: 2026, mes: 1, rubro: 'TEXTIL', meta_venta: 9000 },
    ],
  };
  const supabase = { from(name) {
    let rows = tables[name];
    const query = {
      select() { return query; }, order() { return query; },
      eq(key, value) { rows = rows.filter(row => row[key] === value); return query; },
      in(key, values) { rows = rows.filter(row => values.includes(row[key])); return query; },
      maybeSingle() { return Promise.resolve({ data: rows[0], error: null }); },
      then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
    };
    return query;
  } };
  const domain = createCommercialDomain({ supabase, commercialAccess, aggregateCommercialGoalTotals,
    cleanText: value => String(value || '').trim(), dbError: error => error,
    httpError: message => new Error(message) });
  const result = await domain.commercialStoreGoals({ id: 1, tienda_id: 10 });
  const totals = result.goals.filter(row => !row.category);
  assert.deepEqual(totals.map(row => [row.storeId, row.periodId, row.target]), [['EMA', 202601, 300], ['EMA', 202602, 400]]);
  assert.equal(totals.reduce((sum, row) => sum + row.target, 0), 700);
  assert.equal(result.annualTargets[0].target, 70858940.92);
  assert.ok(result.goals.every(row => row.storeId === 'EMA'));
  tables.metas_comerciales_tienda.push({tienda_id:10,anio:2026,mes:1,rubro:'',meta_venta:123});
  const imported = await domain.commercialStoreGoals({id:1,tienda_id:10});
  assert.equal(imported.goals.find(row=>!row.category&&row.periodId===202601).target,123);
  assert.equal(imported.goals.find(row=>!row.category&&row.periodId===202602).target,400);
});
