import test from 'node:test';
import assert from 'node:assert/strict';
import {trafficHeatScale,TRAFFIC_HEAT_COLORS} from '../src/lib/trafficHeatScale.js';
const scale=values=>trafficHeatScale([{cells:values.map(value=>({value,recorded:true}))}]);
test('minimo rojo y maximo verde incluso con rangos pequenos o valores altos',()=>{
 for(const values of [[0,1],[10,11],[200,250,300],[0,100]]){
  const heat=scale(values);
  assert.equal(heat.color({value:values[0],recorded:true}),TRAFFIC_HEAT_COLORS[0]);
  assert.equal(heat.color({value:values.at(-1),recorded:true}),TRAFFIC_HEAT_COLORS[4]);
  assert.ok(heat.ranges.every(range=>range.label));
 }
});
test('ceros registrados reciben color; ausencias y valores iguales son neutros',()=>{
 assert.notEqual(scale([0,10]).color({value:0,recorded:true}),scale([0,10]).color({value:0,recorded:false}));
 assert.equal(scale([5,5]).color({value:5,recorded:true}),TRAFFIC_HEAT_COLORS[2]);
 assert.deepEqual(scale([]).ranges,[]);
});
