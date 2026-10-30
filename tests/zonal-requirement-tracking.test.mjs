import test from 'node:test';
import assert from 'node:assert/strict';
import { createZonalDomain } from '../netlify/domains/zonal.js';

function fixture({ trackingError = false, conflict = false } = {}) {
  const requirement = { id: 1, tienda_id: 10, estado: 'pendiente', updated_at: 'version-1' };
  const entries = [];
  const tables = { tiendas: [{ id: 10, nombre: 'A' }], requerimientos_tienda: [requirement], requerimiento_seguimientos: entries };
  let updateCount = 0;
  const supabase = { from(table) {
    let payload = null, insert = false;
    const filters = [];
    const q = {
      select() { return q; }, order() { return q; },
      eq(key, value) { filters.push(row => row[key] === value); return q; },
      is(key, value) { filters.push(row => row[key] == value); return q; },
      in(key, values) { filters.push(row => values.includes(row[key])); return q; },
      update(value) { payload = value; return q; },
      insert(value) { payload = value; insert = true; return q; },
      result() { return tables[table].filter(row => filters.every(f => f(row))); },
      async maybeSingle() {
        if (payload && conflict && updateCount++ === 0) return { data: null };
        const row = q.result()[0];
        if (row && payload) Object.assign(row, payload);
        return { data: row ? { ...row } : null };
      },
      async single() {
        assert.ok(insert);
        if (trackingError) return { error: { message: 'tracking failed' } };
        const row = { ...payload, id: entries.length + 1 }; entries.push(row);
        return { data: row };
      },
    };
    return q;
  } };
  const domain = createZonalDomain({ supabase, zonalStoreIds: async () => [10], readAllResult: async q => ({ data: q.result() }), bodyOf: x => x,
    cleanText: x => String(x || '').trim(), httpError: (message, status) => Object.assign(new Error(message), { status }), dbError: e => new Error(e.message) });
  const user = { id: 8, rol: 'jefe_zonal' };
  const input = { estado: 'en_proceso', comentario: 'Coordinado con mantenimiento', estado_anterior: 'pendiente', version: 'version-1' };
  return { domain, requirement, entries, user, input };
}

test('guarda estado y respuesta con el autor real sin aceptar usuario ni tienda del cliente', async () => {
  const f = fixture();
  const result = await f.domain.trackZonalRequirement({ ...f.input, usuario_id: 999, tienda_id: 20 }, f.user, 1);
  assert.equal(f.requirement.estado, 'en_proceso');
  assert.equal(result.seguimiento.usuario_id, 8);
  assert.equal(result.seguimiento.requerimiento_id, 1);
  assert.equal(f.entries.length, 1);
});

test('estados existentes permiten atender, cancelar y reabrir con comentario', async () => {
  for (const estado of ['pendiente', 'en_proceso', 'atendido', 'cancelado']) {
    const f = fixture();
    await f.domain.trackZonalRequirement({ ...f.input, estado }, f.user, 1);
    assert.equal(f.requirement.estado, estado);
    assert.equal(f.entries[0].estado, estado);
  }
});

test('rechaza fuera de alcance, rol de tienda, estados desconocidos y comentarios vacíos', async () => {
  const f = fixture();
  await assert.rejects(f.domain.trackZonalRequirement(f.input, f.user, 2), { status: 403 });
  await assert.rejects(f.domain.trackZonalRequirement(f.input, { ...f.user, rol: 'jefe_tienda' }, 1), { status: 403 });
  for (const input of [{ ...f.input, comentario: '   ' }, { ...f.input, estado: 'en_revision' }, { ...f.input, comentario: 'a'.repeat(4001) }]) {
    await assert.rejects(f.domain.trackZonalRequirement(input, f.user, 1), { status: 400 });
  }
  assert.equal(f.requirement.estado, 'pendiente'); assert.equal(f.entries.length, 0);
});

test('rechaza versiones obsoletas y cambios concurrentes sin crear seguimiento', async () => {
  for (const conflict of [false, true]) {
    const f = fixture({ conflict });
    await assert.rejects(f.domain.trackZonalRequirement({ ...f.input, version: conflict ? 'version-1' : 'old' }, f.user, 1), { status: 409 });
    assert.equal(f.entries.length, 0); assert.equal(f.requirement.estado, 'pendiente');
  }
});

test('si falla el historial restaura el estado previo y devuelve error', async () => {
  const f = fixture({ trackingError: true });
  await assert.rejects(f.domain.trackZonalRequirement(f.input, f.user, 1), /tracking failed/);
  assert.equal(f.requirement.estado, 'pendiente');
  assert.equal(f.requirement.updated_at, 'version-1');
  assert.equal(f.entries.length, 0);
});
