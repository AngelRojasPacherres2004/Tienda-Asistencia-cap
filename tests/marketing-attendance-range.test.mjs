import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarketingDomain } from '../netlify/domains/marketing.js';

test('matriz mensual consulta solo asistencias del personal propio de Marketing', async () => {
  const filters = [];
  const query = Object.fromEntries(['select','eq','gte','lte','order'].map(method => [method, (...args) => { filters.push([method, ...args]); return query; }]));
  const domain = createMarketingDomain({
    supabase: { from: table => { assert.equal(table, 'asistencias_marketing'); return query; } },
    todayISO: () => '2026-11-27',
    httpError: (message, status) => Object.assign(new Error(message), { status }),
    readAllResult: async () => ({ data: [{ personal_id: 8, fecha: '2026-11-17' }] }),
  });
  const result = await domain.marketingAttendance({ id: 42 }, { queryStringParameters: { desde: '2026-11-01', hasta: '2026-11-27' } }, 'GET');
  assert.equal(result.length, 1);
  assert.ok(filters.some(row => row[0] === 'eq' && row[1] === 'personal_marketing.creado_por' && row[2] === 42));
  assert.ok(filters.some(row => row[0] === 'gte' && row[2] === '2026-11-01'));
  await assert.rejects(domain.marketingAttendance({ id: 42 }, { queryStringParameters: { desde: '2026-11-27', hasta: '2026-11-01' } }, 'GET'), { status: 400 });
});
