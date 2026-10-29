import assert from 'node:assert/strict';
import { createWorkforceDomain } from '../netlify/domains/workforce.js';

const today = '2026-10-28';
const domain = createWorkforceDomain({
  bodyOf: event => event.body,
  requireFields: () => {},
  isISODate: value => /^\d{4}-\d{2}-\d{2}$/.test(value),
  todayISO: () => today,
  httpError: (message, status) => Object.assign(new Error(message), { status }),
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { tienda_id: 1, fecha: '2026-10-27' } }) }) }) }) },
});
const admin = { rol: 'jefe_tienda', tienda_id: 1 };
await assert.rejects(() => domain.guardarAsistenciasLote({ body: { fecha: '2026-10-27', marcas: [{}] } }, admin), error => error.status === 403);
await assert.rejects(() => domain.eliminarAsistencia(1, admin), error => error.status === 403);
console.log('Las modificaciones y eliminaciones históricas se rechazan para el administrador.');
