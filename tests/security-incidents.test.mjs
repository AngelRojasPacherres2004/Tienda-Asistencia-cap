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
