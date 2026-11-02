import test from 'node:test';import assert from 'node:assert/strict';import {filterRequirements,isRequirementOverdue} from '../src/lib/requirementFilters.js';
const rows=[{id:1,tienda_id:10,tienda_nombre:'Tienda A',requerimiento:'Extintores',estado:'pendiente',urgencia:'urgente',areas_responsables:['Seguridad'],fecha_inicio:'2026-10-01',fecha_fin_objetivo:'2026-10-15',created_at:'2026-10-01'},{id:2,tienda_id:20,tienda_nombre:'Tienda B',requerimiento:'Pintura',estado:'atendido',urgencia:'largo_plazo',areas_responsables:['Operaciones'],fecha_inicio:'2026-10-02',fecha_fin_objetivo:'2026-10-10',created_at:'2026-10-02'},{id:3,tienda_id:10,tienda_nombre:'Tienda A',requerimiento:'Uniformes',estado:'en_proceso',urgencia:'corto_plazo',areas_responsables:['Personal'],fecha_inicio:'2026-10-03',fecha_fin_objetivo:null,created_at:'2026-10-03'}];const get=f=>filterRequirements(rows,f,'2026-10-30').map(x=>x.id);
test('combina tienda, estado, urgencia y área sin mezclar pedidos',()=>assert.deepEqual(get({store:'10',status:'pendiente',urgency:'urgente',area:'Seguridad'}),[1]));
test('vencidos excluye atendidos, cancelados y sin fecha',()=>{assert.deepEqual(get({late:true}),[1]);assert.equal(isRequirementOverdue({...rows[0],estado:'cancelado'},'2026-10-30'),false)});
test('filtra por fechas inclusivas y busca código o tienda',()=>{assert.deepEqual(get({from:'2026-10-02',to:'2026-10-02'}),[2]);assert.deepEqual(get({search:'req-0001'}),[1]);assert.deepEqual(get({search:'tienda a'}),[3,1])});
test('ordena por urgencia y fecha objetivo con fechas vacías al final',()=>{assert.deepEqual(get({order:'urgencia'}),[1,3,2]);assert.deepEqual(get({order:'objetivo'}),[2,1,3]);assert.deepEqual(get({}),[3,2,1])});
test('filtro sin coincidencias no altera la lista original',()=>{assert.deepEqual(get({store:'999'}),[]);assert.deepEqual(rows.map(x=>x.id),[1,2,3])});
test('prioridad de atención coloca abiertos vencidos antes que pedidos cerrados',()=>{
  assert.deepEqual(get({order:'gestion'}),[1,3,2]);
  const closedUrgent={...rows[0],id:4,estado:'cancelado',created_at:'2026-10-30'};
  assert.deepEqual(filterRequirements([...rows,closedUrgent],{order:'gestion'},'2026-10-30').slice(0,2).map(x=>x.id),[1,3]);
});
