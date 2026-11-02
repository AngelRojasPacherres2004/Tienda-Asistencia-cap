import test from 'node:test';
import assert from 'node:assert/strict';
import { conversionComparable } from '../src/commercial/source-cutoffs.ts';

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
