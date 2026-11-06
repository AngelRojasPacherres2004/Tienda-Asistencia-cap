import test from 'node:test';
import assert from 'node:assert/strict';
import { closingCommercialPeriod, currentCommercialPeriod } from '../src/lib/currentCommercialPeriod.js';

test('opens the published closing month instead of the calendar month', () => {
  assert.deepEqual(closingCommercialPeriod('2026-10-31'), { year: 2026, month: 10 });
  assert.deepEqual(closingCommercialPeriod('2025-12-31'), { year: 2025, month: 12 });
});

test('defaults to the current month in Lima', () => {
  assert.deepEqual(currentCommercialPeriod(new Date('2026-11-05T12:00:00Z')), { year: 2026, month: 11 });
});

test('keeps the previous month and year until midnight in Lima', () => {
  assert.deepEqual(currentCommercialPeriod(new Date('2027-01-01T04:59:59Z')), { year: 2026, month: 12 });
  assert.deepEqual(currentCommercialPeriod(new Date('2027-01-01T05:00:00Z')), { year: 2027, month: 1 });
});
