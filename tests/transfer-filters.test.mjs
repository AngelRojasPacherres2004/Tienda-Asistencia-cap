import { stockTransfers } from '../commercial-dashboard/src/app/stock-transfers.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(new URL('../commercial-dashboard/package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../commercial-dashboard/src/app/app.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('app.ts', source, ts.ScriptTarget.Latest, true);
const app = tree.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'App');
const names = ['transferLines','transferBrands','transferStores','transferAllRecommendations','transferRecommendations',
  'transferPageCount','transferCurrentPage','transferPageRows','clearTransferFilters'];
const code = ts.transpileModule(`export class Subject {${app.members.filter(member => names.includes(member.name?.getText(tree))).map(member => member.getText(tree)).join('\n')}}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(code, {exports, computed: read => read, stockTransfers});
const signal = initial => { let value = initial; const read = () => value; read.set = next => { value = next; }; return read; };

const fixture = () => {
  const rows = [
    {storeId:'A',productId:'SKU1',brand:'UNO',stockUnits:100,goodUnits:100,units30:0},
    {storeId:'B',productId:'SKU1',brand:'UNO',stockUnits:0,goodUnits:0,units30:20},
    {storeId:'A',productId:'SKU2',brand:'DOS',stockUnits:100,goodUnits:100,units30:0},
    {storeId:'C',productId:'SKU2',brand:'DOS',stockUnits:0,goodUnits:0,units30:10},
  ].map(row=>({...row,category:'TEXTIL',line:'DAMA',product:row.productId}));
  return Object.assign(new exports.Subject(), {
    transferProducts:()=>rows, predictiveStoreOptions:()=>['A','B','C'].map(storeId=>({storeId,store:storeId})),
    transferBrand:signal(''), transferStore:signal(''), transferRubro:signal(''), transferLine:signal(''),
    transferSearch:signal(''), transferPriority:signal(''), transferPage:signal(0), normalized:value=>value.toLowerCase(),
  });
};
test('brand filters products and store matches either end without removing the counterpart',()=>{
  const subject=fixture();
  assert.equal(subject.transferRecommendations().length,2);
  subject.transferStore.set('B');
  assert.equal(subject.transferRecommendations().length,1);
  assert.equal(subject.transferRecommendations()[0].source,'A');
  subject.transferStore.set('A');
  assert.equal(subject.transferRecommendations().length,2);
  subject.transferBrand.set('DOS');
  assert.equal(subject.transferRecommendations().length,1);
  assert.equal(subject.transferRecommendations()[0].destination,'C');
  subject.transferStore.set('B');
  assert.equal(subject.transferRecommendations().length,0);
  subject.clearTransferFilters();
  assert.equal(subject.transferRecommendations().length,2);
  assert.equal(subject.transferBrands().join(','),'DOS,UNO');
});
test('pagination stays in range when the filtered result shrinks',()=>{
  const subject=fixture();subject.transferPage.set(99);
  assert.equal(subject.transferCurrentPage(),0);
  assert.equal(subject.transferPageRows().length,2);
  subject.transferBrand.set('MISSING');
  assert.equal(subject.transferPageRows().length,0);
  assert.equal(subject.transferPageCount(),1);
});
