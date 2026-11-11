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
