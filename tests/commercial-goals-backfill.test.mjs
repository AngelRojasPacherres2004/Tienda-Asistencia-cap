import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommercialGoalBackfill } from '../netlify/lib/commercial-goals-backfill.js';

test('preserves historical totals and imports only editable category goals', () => {
  const result = buildCommercialGoalBackfill({
    mappings: [{ dashboard_store_id: 'T001', tienda_id: 7 }],
    monthlyStore: [
      { storeId: 'T001', periodId: 202401, target: 100 },
      { storeId: 'T001', periodId: 202501, target: 120 },
      { storeId: 'T001', periodId: 202601, target: 160 },
    ],
    monthlyCategoryTarget: [
      { storeId: 'T001', periodId: 202601, category: 'TEXTIL', target: 90 },
      { storeId: 'T001', periodId: 202601, category: 'CALZADO', target: 70 },
      { storeId: 'T001', periodId: 202601, category: 'OTROS', target: 10 },
    ],
  });
  assert.deepEqual(result.rows.map(row => [row.anio, row.rubro, row.meta_venta]), [
    [2024, '', 100], [2025, '', 120], [2026, 'CALZADO', 70], [2026, 'TEXTIL', 90],
  ]);
  assert.equal(result.summary[2026].total, 160);
  assert.deepEqual(result.missingStores, []);
});

test('blocks an incomplete store mapping before any write', () => {
  const result = buildCommercialGoalBackfill({
    mappings: [],
    monthlyStore: [{ storeId: 'T404', periodId: 202401, target: 100 }],
  });
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.missingStores, ['T404']);
});
