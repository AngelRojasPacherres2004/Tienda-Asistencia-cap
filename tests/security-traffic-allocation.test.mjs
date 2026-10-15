import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateDailySecurityTraffic, SECURITY_TRAFFIC_HOURS } from '../shared/securityTrafficAllocation.js';

test('distribución horaria conserva cualquier total diario entero', () => {
  for (const total of [0, 1, 7, 91, 277, 1633, 3383]) {
    const hours = allocateDailySecurityTraffic(total, 16, '2026-09-30');
    assert.equal(hours.length, SECURITY_TRAFFIC_HOURS.length);
    assert.ok(hours.every(value => Number.isInteger(value) && value >= 0));
    assert.equal(hours.reduce((sum, value) => sum + value, 0), total);
  }
});

test('perfil estimado tiene pico vespertino y es determinista', () => {
  const day = allocateDailySecurityTraffic(1000, 16, '2026-09-30');
  assert.deepEqual(day, allocateDailySecurityTraffic(1000, 16, '2026-09-30'));
  const evening = day.slice(9, 13).reduce((sum, value) => sum + value, 0);
  const morning = day.slice(0, 4).reduce((sum, value) => sum + value, 0);
  assert.ok(evening > morning);
});

test('rechaza totales inválidos', () => {
  assert.throws(() => allocateDailySecurityTraffic(-1, 16, '2026-09-30'));
  assert.throws(() => allocateDailySecurityTraffic(1.5, 16, '2026-09-30'));
});
