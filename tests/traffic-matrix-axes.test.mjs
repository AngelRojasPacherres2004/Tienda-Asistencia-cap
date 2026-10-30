import test from 'node:test';
import assert from 'node:assert/strict';
import { trafficMatrixHours } from '../src/lib/trafficMatrixAxes.js';
import { TRAFFIC_HOURS } from '../shared/metrics.js';

test('intercambia días y horas conservando cada conteo, cero y celda sin registro', () => {
  const days = [
    { date: '2026-10-30', cells: [{ hour: '09:00-10:00', value: 5, recorded: true }, { hour: '10:00-11:00', value: 0, recorded: true }] },
    { date: '2026-10-29', cells: [{ hour: '09:00-10:00', value: 7, recorded: true }, { hour: '10:00-11:00', value: 0, recorded: false }] },
  ];
  const original = structuredClone(days);
  const result = trafficMatrixHours(days, ['09:00-10:00', '10:00-11:00']);
  assert.deepEqual(result[0].cells.map(cell => [cell.date, cell.value]), [['2026-10-30', 5], ['2026-10-29', 7]]);
  assert.equal(result[0].total, 12);
  assert.equal(result[1].total, 0);
  assert.equal(result[1].recorded, true);
  assert.equal(result[1].cells[0].recorded, true);
  assert.equal(result[1].cells[1].recorded, false);
  assert.deepEqual(days, original);
});

test('horas sin datos no se confunden con tráfico registrado de cero personas', () => {
  const result = trafficMatrixHours([{ date: '2026-10-30', cells: [] }], ['09:00-10:00']);
  assert.equal(result[0].recorded, false);
  assert.equal(result[0].cells[0].recorded, false);
  assert.equal(result[0].total, 0);
});

for (const length of [1, 28, 29, 30, 31]) {
  test(`conserva cada celda y los totales de un período de ${length} días`, () => {
    const days = Array.from({ length }, (_, index) => ({ date: `2026-10-${String(index + 1).padStart(2, '0')}`, cells: TRAFFIC_HOURS.map((hour, hourIndex) => ({ hour, value: (index + hourIndex) % 17, recorded: true })) }));
    const result = trafficMatrixHours(days, TRAFFIC_HOURS);
    assert.equal(result.length, 14);
    for (let hour = 0; hour < 14; hour++) {
      assert.equal(result[hour].cells.length, length);
      for (let day = 0; day < length; day++) assert.equal(result[hour].cells[day].value, days[day].cells[hour].value);
    }
    assert.equal(result.reduce((sum, row) => sum + row.total, 0), days.reduce((sum, day) => sum + day.cells.reduce((n, cell) => n + cell.value, 0), 0));
  });
}
