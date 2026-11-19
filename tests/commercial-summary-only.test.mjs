import test from 'node:test';
import assert from 'node:assert/strict';
import { allowsSummaryRequest, isCommercialSummaryOnly } from '../shared/commercial-summary-only.js';
const user = {id:72,rol:'gerente_comercial',acceso_solo_resumen_comercial:true};
test('la cuenta restringida conserva gráficos y consultas sin escritura', () => {
  for(const path of ['/commercial/access','/commercial/files/dashboard.json','/commercial/store-goals','/dashboard','/trafico/matriz','/asistencias/historial']) assert.equal(allowsSummaryRequest(user,'GET',path),true,path);
  assert.equal(allowsSummaryRequest(user,'POST','/commercial/stock-insights'),true);
});
test('bloquea otros módulos y escrituras aunque se invoquen directamente', () => {
  for(const path of ['/usuarios','/commercial-goals','/reportes','/historial','/systems/maintenance/personnel','/auth/change-credentials']) assert.equal(allowsSummaryRequest(user,'GET',path),false,path);
  for(const method of ['POST','PUT','PATCH','DELETE']) for(const path of ['/usuarios','/commercial-goals','/commercial/transfer-groups','/tiendas','/trafico']) assert.equal(allowsSummaryRequest(user,method,path),false,`${method} ${path}`);
});
test('la restricción depende del permiso y no de un ID o nombre fijo', () => {
  assert.equal(isCommercialSummaryOnly({...user,usuario:'otro-nombre'}),true);
  assert.equal(isCommercialSummaryOnly({id:354,rol:'gerente_comercial'}),false);
  assert.equal(isCommercialSummaryOnly({...user,id:999}),true);
  assert.equal(allowsSummaryRequest({...user,acceso_solo_resumen_comercial:false},'PUT','/commercial-goals'),true);
});
