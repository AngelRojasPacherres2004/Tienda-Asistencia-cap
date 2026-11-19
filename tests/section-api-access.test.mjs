import test from 'node:test';
import assert from 'node:assert/strict';
import {allowsSectionRequest as allows} from '../shared/section-api-access.js';
import {allowedSections, firstAllowedSection} from '../shared/section-catalog.js';
test('general solo resumen conserva lecturas pero bloquea gestión',()=>{
 const u={rol:'gerencia_general',secciones_permitidas:['dashboard']};
 assert.equal(allows(u,'GET','/commercial/access'),true);
 assert.equal(allows(u,'PUT','/commercial-goals'),false);
 assert.equal(allows(u,'GET','/usuarios'),false);
 assert.deepEqual(allowedSections(u),['dashboard']);
});
test('seguridad limitada a tráfico bloquea incidencias y roles ajenos',()=>{
 const u={rol:'seguridad',secciones_permitidas:['seguridad-trafico','usuarios']};
 assert.equal(firstAllowedSection(u),'seguridad-trafico');
 assert.equal(allows(u,'POST','/trafico'),true);
 assert.equal(allows(u,'POST','/incidencias'),false);
 assert.equal(allows(u,'GET','/usuarios'),false);
});
test('permisos según rol mantienen autorización previa y personalizados fallan cerrados',()=>{
 assert.equal(allows({rol:'sistemas'},'GET','/systems/maintenance/personnel'),true);
 assert.equal(allows({rol:'sistemas',secciones_permitidas:['sistemas-credenciales']},'GET','/systems/maintenance/personnel'),false);
 assert.equal(allows({rol:'sistemas',secciones_permitidas:['sistemas-credenciales']},'PATCH','/systems/module-permissions/1'),true);
});
