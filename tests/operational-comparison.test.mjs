import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonMonthRanges, mergeOperationalComparisons } from '../shared/operational-comparison.js';

test('comparison splits calendar months and never requests future dates', () => {
  assert.deepEqual(comparisonMonthRanges([{ desde: '2026-10-15', hasta: '2026-12-31' }], '2026-11-26'), [
    { desde: '2026-10-15', hasta: '2026-10-31' },
    { desde: '2026-11-01', hasta: '2026-11-26' },
  ]);
  assert.deepEqual(comparisonMonthRanges([{ desde: '2026-12-01', hasta: '2026-12-31' }], '2026-11-26'), []);
});

test('comparison preserves selected disjoint months, leap years and year boundaries', () => {
  assert.deepEqual(comparisonMonthRanges([{ desde: '2024-02-01', hasta: '2024-02-29' }, { desde: '2024-12-31', hasta: '2025-01-02' }], '2026-11-26'), [
    { desde: '2024-02-01', hasta: '2024-02-29' },
    { desde: '2024-12-31', hasta: '2024-12-31' },
    { desde: '2025-01-01', hasta: '2025-01-02' },
  ]);
});

test('comparison sums events within scope without duplicating headcount or document alerts', () => {
  const results = [{ tiendas: [{ id: 1, personal: 10, presentes: 5, visitas: 20, documentos_por_vencer: 2 }, { id: 2, presentes: 999 }] },
    { tiendas: [{ id: 1, personal: 12, presentes: 7, visitas: 30, documentos_por_vencer: 3 }] }];
  const [row] = mergeOperationalComparisons(results, ['1']);
  assert.equal(row.presentes, 12);
  assert.equal(row.visitas, 50);
  assert.equal(row.personal, 12);
  assert.equal(row.documentos_por_vencer, 3);
  assert.equal(mergeOperationalComparisons(results, ['1']).length, 1);
  assert.deepEqual(mergeOperationalComparisons(results, []), []);
});
