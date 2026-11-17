import test from 'node:test';
import assert from 'node:assert/strict';
import {rankingRelativeScore,rankingMetricShare} from '../shared/rankingPresentation.js';
test('primer puesto 100%, otros relativos al puntaje y empates iguales',()=>{
 assert.deepEqual([8,8,10,16].map(score=>rankingRelativeScore(8,score)),[1,1,.8,.5]);
 assert.equal(rankingRelativeScore(0,0),null);
 assert.equal(rankingRelativeScore(8,NaN),null);
});
test('ventas y venta m2 usan su propio maximo como 100%',()=>{
 assert.equal(rankingMetricShare(1000,1000),1);
 assert.equal(rankingMetricShare(500,1000),.5);
 assert.equal(rankingMetricShare(75,100),.75);
 assert.equal(rankingMetricShare(0,1000),0);
 assert.equal(rankingMetricShare(null,1000),null);
 assert.equal(rankingMetricShare(0,0),null);
});
