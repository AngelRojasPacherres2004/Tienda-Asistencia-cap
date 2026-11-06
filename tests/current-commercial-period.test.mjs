import test from 'node:test';
import assert from 'node:assert/strict';
import { currentCommercialPeriod } from '../src/lib/currentCommercialPeriod.js';

test('defaults to the current month in Lima', () => {
  assert.deepEqual(currentCommercialPeriod(new Date('2026-11-05T12:00:00Z')), { year: 2026, month: 11 });
});

test('keeps the previous month and year until midnight in Lima', () => {
  assert.deepEqual(currentCommercialPeriod(new Date('2027-01-01T04:59:59Z')), { year: 2026, month: 12 });
  assert.deepEqual(currentCommercialPeriod(new Date('2027-01-01T05:00:00Z')), { year: 2027, month: 1 });
});
