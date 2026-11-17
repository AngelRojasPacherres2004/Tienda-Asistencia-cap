import test from 'node:test';
import assert from 'node:assert/strict';
import { trainingGroups, compareTrainingCourses, trainingCourseLabel } from '../shared/trainingGroups.js';
test('los tres planes conservan su orden y destinatarios', () => {
 assert.deepEqual(trainingGroups.map(g=>g.courses.length),[5,8,9]);
 assert.equal(new Set(trainingGroups.flatMap(g=>g.roles)).size,8);
 for(const group of trainingGroups) for(const role of group.roles) {
  const rows=group.courses.toReversed().map(titulo=>({titulo}));
  assert.deepEqual(rows.sort(compareTrainingCourses(role)).map(r=>r.titulo),group.courses);
 }
 assert.equal(trainingGroups[0].courses.includes('Técnica de venta'),false);
 assert.equal(trainingGroups[1].courses.includes('Cronograma comercial'),false);
 assert.equal(trainingGroups[2].courses[2],'Cronograma comercial');
});
test('historial fuera del plan se conserva al final con orden estable',()=>{
 const rows=[{nombre:'Curso anterior'},{nombre:'Manual de funciones'},{nombre:'Otro curso anterior'}];
 assert.deepEqual(rows.sort(compareTrainingCourses('seguridad')).map(r=>r.nombre),['Manual de funciones','Curso anterior','Otro curso anterior']);
});

test('cada rol muestra su numeracion sin prefijos CAP anteriores', () => {
 for (const group of trainingGroups) for (const role of group.roles) {
   group.courses.forEach((title, index) => {
     const label = trainingCourseLabel(title, role);
     assert.ok(label.startsWith((index + 1) + '. '));
     assert.equal(/CAP\s*\d/i.test(label), false);
   });
 }
 const title = trainingGroups[0].courses[2];
 assert.ok(trainingCourseLabel(title, 'seguridad').startsWith('3. '));
 assert.ok(trainingCourseLabel(title, 'jefe_tienda').startsWith('4. '));
 assert.equal(trainingCourseLabel('Curso anterior', 'seguridad'), 'Curso anterior');
});
