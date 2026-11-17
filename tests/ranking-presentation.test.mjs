import test from 'node:test';
import assert from 'node:assert/strict';
import {rankingRelativeScore,visibleRankingDetails} from '../shared/rankingPresentation.js';
test('primer puesto 100%, otros relativos al puntaje y empates iguales',()=>{
 assert.deepEqual([8,8,10,16].map(score=>rankingRelativeScore(8,score)),[1,1,.8,.5]);
 assert.equal(rankingRelativeScore(0,0),null);
 assert.equal(rankingRelativeScore(8,NaN),null);
});
test('administrador no ve ventas ni venta por m2 en ningun filtro',()=>{
 const details=['SALES','SALE_M2','TICKET','ROTATION','MARKUP'].map(metric=>({metric,value:123}));
 assert.deepEqual(visibleRankingDetails(details,'jefe_tienda').map(row=>row.metric),['TICKET','ROTATION','MARKUP']);
 assert.deepEqual(visibleRankingDetails(details.slice(0,1),'jefe_tienda'),[]);
 assert.equal(visibleRankingDetails(details,'gerente_comercial'),details);
 assert.equal(details.length,5);
});
