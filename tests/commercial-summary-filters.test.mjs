import test from 'node:test';
import assert from 'node:assert/strict';
import { commercialSummaryRanges, mergeCommercialSummaries } from '../src/lib/commercialSummaryFilters.js';

test('summary follows selected months, without including unselected months', () => {
  assert.deepEqual(commercialSummaryRanges({ year: 2026, months: [11, 2, 2] }, '2026-11-10'), [
    { desde: '2026-02-01', hasta: '2026-02-28' },
    { desde: '2026-11-01', hasta: '2026-11-10' },
  ]);
});

test('summary follows the global day or date range', () => {
  assert.deepEqual(commercialSummaryRanges({ year: 2026, months: [11], fromDate: '2026-11-04', toDate: '' }, '2026-11-10'), [{ desde: '2026-11-04', hasta: '2026-11-04' }]);
  assert.deepEqual(commercialSummaryRanges({ year: 2026, months: [11], fromDate: '2026-11-04', toDate: '2026-11-08' }, '2026-11-10'), [{ desde: '2026-11-04', hasta: '2026-11-08' }]);
});

test('multi-month attendance counts a worker once and adds attendance records without duplicating courses', () => {
  const result = mergeCommercialSummaries([
    { summary: { cursos_en_curso: 2 }, progresoCursos: [{ pendientes: 3 }], attendanceByWorker: [{ usuario_id: 1, presente: 3, ausencia: 1, total: 4 }] },
    { summary: { cursos_en_curso: 2 }, attendanceByWorker: [{ usuario_id: 1, presente: 2, suspension: 1, total: 3 }, { usuario_id: 2, presente: 1 }] },
  ]);
  assert.equal(result.attendanceByWorker.length, 2);
  assert.equal(result.attendanceByWorker[0].presente, 5);
  assert.equal(result.attendanceByWorker[0].ausencia, 1);
  assert.equal(result.attendanceByWorker[0].suspension, 1);
  assert.equal(result.attendanceByWorker[0].total, 7);
  assert.equal(result.summary.cursos_en_curso, 2);
  assert.equal(result.progresoCursos[0].pendientes, 3);
});

test('consecutive months share one request range', () => {
  assert.deepEqual(commercialSummaryRanges({ year: 2026, months: [1, 2, 3] }, '2026-11-10'), [{ desde: '2026-01-01', hasta: '2026-03-31' }]);
});
