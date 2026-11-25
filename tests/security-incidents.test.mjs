import assert from "node:assert/strict";
import test from "node:test";
import { isSecurityIncident } from "../shared/securityIncidents.js";

test("incidencias de seguridad incluyen Otro solo con el asunto homologado", () => {
  assert.equal(isSecurityIncident({ tipo: "robo" }), true);
  assert.equal(isSecurityIncident({ tipo: "cambio_precio" }), true);
  assert.equal(isSecurityIncident({ tipo: "otro", asunto: "Otra incidencia de seguridad" }), true);
  assert.equal(isSecurityIncident({ tipo: "otro", asunto: "Otro motivo interno" }), false);
  assert.equal(isSecurityIncident({ tipo: "ausencia" }), false);
});

import { createOperationsDomain } from '../netlify/domains/operations.js';

test('security can create and edit an incident with no description or detention detail', async () => {
  let saved;
  const user = { id: 7, rol: 'seguridad', tienda_id: 3 };
  const input = { tipo: 'robo', gravedad: 'media', area: 'textil', detencion: true, productos: [], personas: [] };
  const supabase = { from(table) {
    let operation = 'read', payload;
    const result = () => ({ error: null, data: table === 'incidencias'
      ? operation === 'read' ? { fecha: new Date().toISOString() } : saved
      : table === 'usuarios' ? [] : {} });
    const query = {
      select() { return query; }, eq() { return query; }, in() { return query; }, not() { return query; },
      insert(value) { operation = 'insert'; payload = value; saved = { id: 10, ...payload }; return query; },
      update(value) { operation = 'update'; payload = value; saved = { ...saved, ...payload }; return query; },
      delete() { operation = 'delete'; return query; },
      single: async () => result(), maybeSingle: async () => result(),
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
    return query;
  } };
  const domain = createOperationsDomain({ supabase, createSecurityDomain: () => ({}),
    bodyOf: event => event.body, cleanText: value => String(value ?? '').trim(),
    requireFields(data, keys) { for (const key of keys) assert.ok(data[key], `Missing ${key}`); },
    httpError: (message, status) => Object.assign(new Error(message), { status }), dbError: error => error,
  });
  const created = await domain.createIncident({ body: input }, user);
  assert.equal(created.tienda_id, user.tienda_id);
  assert.equal(created.registrado_por, user.id);
  assert.equal(created.descripcion, '');
  assert.equal(created.detencion, true);
  assert.equal(created.detencion_detalle, '');
  const fecha = `${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())}T10:00:00-05:00`;
  const updated = await domain.updateIncident({ body: { ...input, fecha } }, user, created.id);
  assert.equal(updated.descripcion, '');
  assert.equal(updated.detencion, true);
  assert.equal(updated.detencion_detalle, '');
});

function incidentDomain() {
  const reachedDatabase = new Error('reached authorized database operation');
  let writes = 0;
  const domain = createOperationsDomain({
    createSecurityDomain: () => ({}),
    bodyOf: event => event.body,
    requireFields() {},
    cleanText: value => String(value || '').trim(),
    httpError: (message, status) => Object.assign(new Error(message), { status }),
    supabase: { from() { writes++; throw reachedDatabase; } },
  });
  return { domain, reachedDatabase, writes: () => writes };
}

test('store administrators and assistants cannot create incidents, including security types', async () => {
  const fixture = incidentDomain();
  for (const rol of ['jefe_tienda', 'asistente_tienda', 'sistemas']) {
    for (const tipo of ['falla_interna', 'robo']) {
      await assert.rejects(fixture.domain.createIncident({ body: { descripcion: 'Example', gravedad: 'media', tipo } }, { rol, tienda_id: 1 }), error => error.status === 403);
    }
  }
  assert.equal(fixture.writes(), 0);
});

test('security and security chief can submit security types but not retired internal types', async () => {
  for (const rol of ['seguridad', 'jefe_seguridad']) {
    const fixture = incidentDomain();
    for (const tipo of ['falla_interna', 'problema_operativo', 'dano_infraestructura', 'accidente']) {
      await assert.rejects(fixture.domain.createIncident({ body: { descripcion: 'Example', gravedad: 'media', tipo } }, { rol, tienda_id: 1 }), error => error.status === 400);
    }
    assert.equal(fixture.writes(), 0);
    for (const tipo of ['robo', 'robo_frustrado', 'robo_interno', 'estafa', 'asalto', 'fiscalizacion', 'cambio_precio', 'otro']) {
      await assert.rejects(fixture.domain.createIncident({ body: { descripcion: 'Example', gravedad: 'media', tipo } }, { rol, tienda_id: 1 }), error => error === fixture.reachedDatabase);
    }
    assert.equal(fixture.writes(), 8);
  }
});
