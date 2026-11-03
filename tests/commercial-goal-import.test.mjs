import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { GOAL_MONTHS, parseGoalMatrix } from '../src/lib/commercialGoalImport.js';
const stores = [{id:1, nombre:'EMANCIPACIÓN', codigo:'EMA'}, {id:2, nombre:'OTRA', codigo:'OTR'}];
const head = ['TIENDA', ...GOAL_MONTHS];
test('lee Excel real y conserva vacíos, cero y formatos monetarios', async () => {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Metas');
  sheet.addRow(head); sheet.addRow(['emancipacion', 0, null, 'S/ 1,234.56', '1234,56']);
  const loaded = new ExcelJS.Workbook(); await loaded.xlsx.load(await book.xlsx.writeBuffer());
  const rows = []; loaded.worksheets[0].eachRow(row => rows.push(Array.from({length:13},(_,i)=>row.getCell(i+1).value)));
  const result = parseGoalMatrix(rows, stores);
  assert.deepEqual(result.patch, {'1|1':'0', '1|3':'1234.56','1|4':'1234.56'});
  assert.equal(result.count, 3);
});
test('rechaza tiendas desconocidas, duplicados, montos inválidos y fórmulas sin devolver cambios parciales', () => {
  for (const rows of [
    [head,['NO EXISTE',100]], [head,['EMA',100],['EMANCIPACIÓN',200]],
    [head,['EMA',-1]], [head,['EMA','hola']], [head,['EMA',{formula:'1+1',result:2}]],
    [head,['EMA',1.234]], [['TIENDA','ENE'],['EMA',10]], [head,['EMA']],
  ]) assert.throws(()=>parseGoalMatrix(rows,stores));
});
test('acepta el formato CUOTA TIENDAS con año, nombres completos de meses y alias verificados',()=>{
 const names=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
 const result=parseGoalMatrix([[2026,...names,'CUOTA ACUMULADA'],['MARINA',700000.036,null,null,null,null,null,null,null,null,null,null,null,{formula:'SUM(B2:M2)',result:700000.036}]], [{id:22,nombre:'LA MARINA',codigo:'MAR'}]);
 assert.equal(result.year,2026);assert.equal(result.totalScope,true);assert.deepEqual(result.patch,{'22|1':'700000.04'});
});
