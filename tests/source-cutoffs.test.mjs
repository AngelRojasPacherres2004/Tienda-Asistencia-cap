import test from 'node:test';
import assert from 'node:assert/strict';
import { conversionComparable, stockPeriodForDate } from '../src/commercial/source-cutoffs.ts';

test('no compara ventas de fin de mes con tráfico incompleto', () => {
  assert.equal(conversionComparable('2026-10-31', '2026-10-25', '2026-10-31'), false);
  assert.equal(conversionComparable('2026-10-31', '2026-10-25', '2026-10-24'), true);
  assert.equal(conversionComparable('2026-10-31', '2026-10-25', '2026-09-30'), true);
  assert.equal(conversionComparable('2026-10-31', '2026-10-31', '2026-10-31'), true);
});

test('una publicación parcial usa su corte y publicaciones anteriores siguen funcionando', () => {
  assert.equal(conversionComparable('2026-10-15', '2026-10-15', '2026-10-31'), true);
  assert.equal(conversionComparable('2026-10-15', undefined, '2026-10-31'), true);
});

test('conserva fotos archivadas y usa la fecha real de un stock de inicio de mes', () => {
  const periods = [202603, 202604, 202607, 202611];
  const files = ['dashboard-stock-price-range-2026-06.json', 'dashboard-stock-price-range-2026-13.json'];
  assert.equal(stockPeriodForDate(periods, files, '2026-06-30', '2026-11-01'), 202606);
  assert.equal(stockPeriodForDate(periods, files, '2026-11-01', '2026-11-01'), 202611);
  assert.equal(stockPeriodForDate(periods, files, '2026-10-31', '2026-11-01'), 202607);
  assert.equal(stockPeriodForDate([], [], '2026-10-31', ''), null);
});
