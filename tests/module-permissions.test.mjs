import assert from 'node:assert/strict';
import test from 'node:test';
import { createModulePermissionsDomain } from '../netlify/domains/module-permissions.js';

const systems = { id: 1, rol: 'sistemas' };
const target = { id: 2, usuario: 'comercial', rol: 'gerente_comercial', estado: 'activo', password: 'existing-hash', acceso_solo_resumen_comercial: false };

function fixture(overrides = {}) {
  const rows = [{ id: 1, rol: 'sistemas', estado: 'activo' }, { ...target }];
  const writes = [];
  const reads = [];
  const supabase = {
    from(table) {
      assert.equal(table, 'usuarios');
      const filters = [];
      let payload;
      let fields;
      const result = () => {
        const matches = rows.filter(row => filters.every(([key, value]) => row[key] === value));
        if (payload) {
          writes.push({ payload: { ...payload }, ids: matches.map(row => row.id) });
          matches.forEach(row => Object.assign(row, payload));
        } else reads.push({ fields, ids: matches.map(row => row.id) });
        const data = matches.map(row => fields && fields !== '*' ? Object.fromEntries(fields.split(',').map(key => [key, row[key]])) : { ...row });
        return { data, error: null };
      };
      const query = {
        select(value) { fields = value; return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        update(value) { payload = value; return query; },
        maybeSingle() { const value = result(); return Promise.resolve({ ...value, data: value.data[0] || null }); },
        single() { const value = result(); return Promise.resolve({ ...value, data: value.data[0] || null }); },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return query;
    },
  };
  const domain = createModulePermissionsDomain({
    supabase,
    bodyOf: event => event.body,
    httpError: (message, status) => Object.assign(new Error(message), { status }),
    dbError: error => error,
    disabledPassword: 'DISABLED',
    ...overrides,
  });
  return { domain, rows, writes, reads };
}

const call = (domain, summaryOnly, user = systems, id = 2) => domain.setModulePermission({ body: { summaryOnly } }, user, id);

test('solo Sistemas puede cambiar el permiso, aunque la sesión afirme otro rol', async () => {
  const { domain, writes } = fixture();
  await assert.rejects(call(domain, true, { id: 3, rol: 'gerente_comercial' }), error => error.status === 403);
  assert.equal(writes.length, 0);
});

test('vuelve a comprobar el rol y estado actuales de Sistemas en la base de datos', async () => {
  for (const update of [{ rol: 'gerente_comercial' }, { estado: 'inactivo' }]) {
    const { domain, rows, writes } = fixture();
    Object.assign(rows[0], update);
    await assert.rejects(call(domain, true), error => error.status === 403);
    assert.equal(writes.length, 0);
  }
});

test('rechaza identificadores y valores de permiso inválidos sin escribir', async () => {
  for (const [id, value] of [[0, true], [-2, true], ['x', true], [2.5, true], [2, 'true'], [2, 1], [2, null], [2, undefined]]) {
    const { domain, writes } = fixture();
    await assert.rejects(call(domain, value, systems, id), error => error.status === 400);
    assert.equal(writes.length, 0);
  }
});

test('permite restringir cada rol con Resumen comercial y conserva sus credenciales', async () => {
  for (const rol of ['gerente_comercial', 'jefe_zonal', 'jefe_tienda', 'asistente_tienda', 'coach']) {
    const { domain, rows, writes } = fixture();
    rows[1].rol = rol;
    const result = await call(domain, true);
    assert.equal(result.account.id, 2);
    assert.equal(result.account.acceso_solo_resumen_comercial, true);
    assert.equal(rows[1].password, 'existing-hash');
    assert.equal(rows[1].usuario, 'comercial');
    assert.deepEqual(writes, [{ payload: { acceso_solo_resumen_comercial: true }, ids: [2] }]);
  }
});

test('desactivar la restricción restablece el acceso del rol sin tocar la contraseña', async () => {
  const { domain, rows, writes } = fixture();
  rows[1].acceso_solo_resumen_comercial = true;
  const result = await call(domain, false);
  assert.equal(result.account.acceso_solo_resumen_comercial, false);
  assert.equal(rows[1].password, 'existing-hash');
  assert.deepEqual(writes[0].payload, { acceso_solo_resumen_comercial: false });
});

test('no permite restringir Sistemas ni roles sin dashboard comercial', async () => {
  for (const rol of ['sistemas', 'marketing', 'seguridad', 'trabajador', 'asistente_comercial']) {
    const { domain, rows, writes } = fixture();
    rows[1].rol = rol;
    await assert.rejects(call(domain, true), error => error.status === 400);
    assert.equal(writes.length, 0);
  }
});

test('no modifica cuentas inexistentes, inactivas o sin acceso de usuario', async () => {
  for (const update of [null, { estado: 'inactivo' }, { usuario: null }, { password: null }, { password: 'DISABLED' }]) {
    const { domain, rows, writes } = fixture();
    if (update) Object.assign(rows[1], update); else rows.pop();
    await assert.rejects(call(domain, true), error => [400, 404].includes(error.status));
    assert.equal(writes.length, 0);
  }
});
