import test from 'node:test';
import assert from 'node:assert/strict';
import { createSystemsMaintenanceDomain } from '../netlify/domains/systems-maintenance.js';

function fixture({ role = 'sistemas', state = 'activo', rows = [], mappings = [], error = null } = {}) {
  const writes = [];
  const filters = [];
  const rpcCalls = [];
  const supabase = { async rpc(name, args) { rpcCalls.push({ name, args }); return { data: name === 'systems_suspend_personnel' ? { id: args.p_target_id, suspendido_sistemas: args.p_suspend, estado: args.p_suspend ? 'inactivo' : 'activo' } : { deleted: true, id: args.p_target_id }, error }; }, from(table) {
    const query = {
      select() { return this; }, order() { return this; }, in() { return this; },
      eq(column, value) { filters.push([table, column, value]); return this; },
      delete() { writes.push(table); return this; },
      async maybeSingle() { return { data: { id: 1, rol: role, estado: state }, error: null }; },
      then(resolve, reject) { return Promise.resolve({ data: table === 'commercial_store_map' ? mappings : rows, error }).then(resolve, reject); },
    };
    return query;
  } };
  const domain = createSystemsMaintenanceDomain({ supabase,
    readAllResult: query => query, storeStaffRoles: ['vendedor'],
    httpError: (message, status) => Object.assign(new Error(message), { status }), dbError: error => new Error(error.message),
  });
  return { domain, writes, filters, rpcCalls };
}
const actor = { id: 1, rol: 'sistemas' };
const groupId = 'a0000000-0000-4000-8000-000000000001';

for (const method of ['listPersonnel', 'listTransfers', 'deleteTransfer', 'deletePersonnel', 'suspendPersonnel']) {
  test(`${method}: refuses other roles and revoked systems access`, async () => {
    for (const options of [{ role: 'jefe_tienda' }, { state: 'inactivo' }]) {
      const f = fixture(options);
      await assert.rejects(f.domain[method](actor, groupId), { status: 403 });
      assert.equal(f.writes.length, 0);
    }
    const f = fixture();
    await assert.rejects(f.domain[method]({ id: 2, rol: 'gerente_comercial' }, groupId), { status: 403 });
  });
}

test('deletes only rows of the selected UUID group', async () => {
  const f = fixture({ rows: [{ id: 7 }, { id: 8 }] });
  assert.deepEqual(await f.domain.deleteTransfer(actor, groupId), { deleted: true, count: 2 });
  assert.deepEqual(f.writes, ['commercial_transfer_items']);
  assert.ok(f.filters.some(([, column, value]) => column === 'grupo_id' && value === groupId));
});

test('rejects missing or malformed group IDs before deletion', async () => {
  for (const value of ['', undefined, '*', 'invalid']) {
    const f = fixture();
    await assert.rejects(f.domain.deleteTransfer(actor, value), { status: 400 });
    assert.deepEqual(f.writes, []);
  }
  await assert.rejects(fixture().domain.deleteTransfer(actor, groupId), { status: 404 });
});

test('groups all saved lines without losing units or products', async () => {
  const f = fixture({ rows: [1, 2].map(id => ({ id, grupo_id: groupId, tienda_origen: 'T001', tienda_destino: 'T002', cantidad: 3, producto: `Producto ${id}` })) });
  const { groups } = await f.domain.listTransfers(actor);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].quantity, 6);
  assert.equal(groups[0].items.length, 2);
});

test('database failures do not report successful deletion', async () => {
  const f = fixture({ error: { message: 'Database unavailable' } });
  await assert.rejects(f.domain.deleteTransfer(actor, groupId), /Database unavailable/);
});

test('saved transfer groups display mapped store names instead of commercial codes', async () => {
  const f = fixture({ mappings: [
    { dashboard_store_id: 'T001', tiendas: { nombre: 'AYACUCHO' } },
    { dashboard_store_id: 'T002', tiendas: { nombre: 'ARAMBURÚ' } },
  ], rows: [{ grupo_id: groupId, tienda_origen: 'T001', tienda_destino: 'T002', cantidad: 2 }] });
  const { groups } = await f.domain.listTransfers(actor);
  assert.equal(groups[0].origin, 'AYACUCHO');
  assert.equal(groups[0].destination, 'ARAMBURÚ');
  assert.equal(groups[0].id, groupId);
});

test('personnel deletion uses one atomic RPC with the authenticated actor', async () => {
  const f = fixture();
  assert.deepEqual(await f.domain.deletePersonnel(actor, '22'), { deleted: true, id: 22 });
  assert.deepEqual(f.rpcCalls, [{ name: 'systems_delete_personnel', args: { p_actor_id: 1, p_target_id: 22 } }]);
  assert.deepEqual(f.writes, []);
});

test('suspends and reactivates through the dedicated RPC without deleting rows', async () => {
  const f = fixture();
  for (const suspended of [true, false]) {
    const result = await f.domain.suspendPersonnel(actor, 22, suspended);
    assert.equal(result.person.suspendido_sistemas, suspended);
    assert.equal(result.person.estado, suspended ? 'inactivo' : 'activo');
  }
  assert.deepEqual(f.writes, []);
  assert.ok(f.rpcCalls.every(call => call.name === 'systems_suspend_personnel'));
  for (const value of [undefined, 'true', null]) await assert.rejects(f.domain.suspendPersonnel(actor, 22, value), { status: 400 });
});

test('rejects invalid personnel IDs and self deletion without invoking the RPC', async () => {
  const f = fixture();
  for (const id of [0, -1, 'abc', '2.2', '9007199254740993', 1]) {
    await assert.rejects(f.domain.deletePersonnel(actor, id), { status: 400 });
  }
  assert.equal(f.rpcCalls.length, 0);
});

test('maps missing personnel and revoked permissions to actionable errors', async () => {
  for (const [code, status] of [['P0002', 404], ['42501', 403]]) {
    const f = fixture({ error: { code, message: 'Rejected' } });
    await assert.rejects(f.domain.deletePersonnel(actor, 22), { status });
  }
});
