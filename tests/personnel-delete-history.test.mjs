import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonnelDomain } from '../netlify/domains/personnel.js';

function fixture({ attendance = 0, training = 0, checkError = null, deleteError = null, deleted = [{ id: 299 }], targetMissing = false } = {}) {
  const writes = [];
  const supabase = { from(table) {
    const query = {
      select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: targetMissing ? null : { id: 299, rol: 'seguridad', tienda_id: 22 }, error: null }),
      update() { throw new Error('No debe modificar el estado del trabajador'); },
      delete() { writes.push(table); return this; },
      then(resolve, reject) {
        return Promise.resolve(table === 'usuarios' ? { data: deleted, error: deleteError } : {
          count: table === 'asistencias' ? attendance : training, error: checkError,
        }).then(resolve, reject);
      },
    };
    return query;
  } };
  const domain = createPersonnelDomain({ supabase,
    httpError: (message, status) => Object.assign(new Error(message), { status }),
    dbError: error => new Error(error.message), storeManagementRoles: new Set(['jefe_tienda', 'asistente_tienda']),
  });
  const defaultActor = { id: 10, rol: 'jefe_tienda', tienda_id: 22 };
  return { writes, remove: (actor = defaultActor) => domain.deleteUser(299, actor), status: (actor = defaultActor) => domain.userDeletionStatus(299, actor) };
}

for (const history of [{ attendance: 1 }, { training: 1 }]) {
  test(`conserva trabajador e historial sin inhabilitar: ${JSON.stringify(history)}`, async () => {
    const f = fixture(history);
    const result = await f.remove();
    assert.equal(result.tiene_historial, true);
    assert.equal(result.eliminado, false);
    assert.equal(result.inhabilitado, false);
    assert.match(result.mensaje, /Sistemas desde Gestión de registros/);
    assert.deepEqual(f.writes, []);
  });
}

for (const deleteError of [{ code: '23503', message: 'foreign key violation' }, { code: 'P0001', message: 'WORKER_HAS_HISTORY' }]) {
  test(`convierte excepción ${deleteError.code} en aviso de historial`, async () => {
    const f = fixture({ deleteError });
    assert.equal((await f.remove()).tiene_historial, true);
  });
}

test('solo informa eliminación cuando la base la acepta', async () => {
  const f = fixture();
  assert.deepEqual(await f.remove(), { eliminado: true, inhabilitado: false });
});

test('si falla verificar el historial no intenta eliminar', async () => {
  const f = fixture({ checkError: { message: 'Consulta no disponible' } });
  await assert.rejects(f.remove(), /Consulta no disponible/);
  assert.deepEqual(f.writes, []);
});

test('no disfraza otros errores como historial y conserva permisos', async () => {
  await assert.rejects(fixture({ deleteError: { code: 'OTHER', message: 'Sin conexión' } }).remove(), /Sin conexión/);
  const f = fixture();
  await assert.rejects(f.remove({ id: 10, rol: 'jefe_tienda', tienda_id: 23 }), error => error.status === 403);
  assert.deepEqual(f.writes, []);
});

test('avisa si ya no existe antes de empezar o si otro administrador lo eliminó', async () => {
  const missing = fixture({ targetMissing: true });
  assert.deepEqual(await missing.remove(), { eliminado: false, ya_no_existe: true });
  assert.deepEqual(missing.writes, []);
  assert.deepEqual(await fixture({ deleted: [] }).remove(), { eliminado: false, ya_no_existe: true });
});

test('no afirma éxito si la base no devuelve las filas eliminadas', async () => {
  await assert.rejects(fixture({ deleted: null }).remove(), /No se pudo confirmar/);
});

test('la verificación consulta existencia sin modificar registros y respeta la tienda', async () => {
  const f = fixture();
  assert.deepEqual(await f.status(), { existe: true });
  assert.deepEqual(await fixture({ targetMissing: true }).status(), { existe: false });
  await assert.rejects(f.status({ id: 10, rol: 'jefe_tienda', tienda_id: 23 }), error => error.status === 403);
  assert.deepEqual(f.writes, []);
});
