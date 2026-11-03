import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonnelDomain } from '../netlify/domains/personnel.js';

function setup() {
  const people = [
    { id: 1, nombres: 'Administrador', apellidos: 'Principal', rol: 'jefe_tienda', tienda_id: 10, estado: 'activo' },
    { id: 2, nombres: 'Asistente', apellidos: 'Tienda', rol: 'asistente_tienda', tienda_id: 10, estado: 'activo' },
    { id: 3, nombres: 'Vendedor', apellidos: 'Tienda', rol: 'vendedor', tienda_id: 10, estado: 'activo' },
    { id: 4, nombres: 'Administrador', apellidos: 'Ajeno', rol: 'jefe_tienda', tienda_id: 20, estado: 'activo' },
  ];
  const supabase = { from(table) {
    const filters = [];
    const query = {
      select() { return this; }, order() { return this; },
      eq(key, value) { filters.push(row => row[key] === value); return this; },
      in(key, values) { filters.push(row => values.includes(row[key])); return this; },
      update() { throw new Error('Unexpected write'); }, delete() { throw new Error('Unexpected delete'); },
      maybeSingle() { return Promise.resolve({ data: people.find(row => filters.every(filter => filter(row))), error: null }); },
      then(resolve, reject) { return Promise.resolve({ data: table === 'usuarios' ? people.filter(row => filters.every(filter => filter(row))) : [], error: null }).then(resolve, reject); },
    };
    return query;
  } };
  return createPersonnelDomain({
    supabase, readAllResult: query => query, fetchAllReportPages: async query => (await query).data,
    httpError: (message, status) => Object.assign(new Error(message), { status }), dbError: error => error,
    storeManagementRoles: new Set(['jefe_tienda', 'asistente_tienda']), storeStaffRoles: ['jefe_tienda', 'asistente_tienda', 'vendedor'],
    normalizeLaborArea: value => value, normalizeDepartureReason: value => value,
    bodyOf: event => event.body, validateUserPayload() {},
  });
}

test('store administrator sees own profile and own team without another store', async () => {
  const domain = setup();
  const rows = await domain.listUsers({ id: 1, rol: 'jefe_tienda', tienda_id: 10 });
  assert.deepEqual(rows.map(row => row.id), [1, 2, 3]);
});

test('showing the administrator does not grant store roles permission to edit or delete that profile', async () => {
  const domain = setup();
  for (const rol of ['jefe_tienda', 'asistente_tienda']) {
    const actor = { id: 2, rol, tienda_id: 10 };
    await assert.rejects(domain.updateUser({ body: { rol: 'jefe_tienda' } }, 1, actor), error => error.status === 403);
    await assert.rejects(domain.deleteUser(1, actor), error => error.status === 403);
  }
});
