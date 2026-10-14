import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { SectionLoads } from '../commercial-dashboard/src/app/section-loads.ts';

const require = createRequire(new URL('../commercial-dashboard/package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../commercial-dashboard/src/app/app.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('app.ts', source, ts.ScriptTarget.Latest, true);
const app = tree.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'App');
const methods = ['ensureSellerDetail', 'loadDetail', 'releaseSectionDetails'];
const code = ts.transpileModule(`export class Subject {${app.members.filter(member => methods.includes(member.name?.getText(tree))).map(member => member.getText(tree)).join('\n')}}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(code.replaceAll('import.meta.url', JSON.stringify(import.meta.url)), { exports, URL, Worker: undefined, AbortController, DOMException });
const signal = initial => {
  let value = initial;
  const read = () => value;
  read.set = next => { value = next; };
  read.update = callback => { value = callback(value); };
  return read;
};
const sellerSubject = () => Object.assign(new exports.Subject(), {
  sectionLoads: new SectionLoads(), sellerDetailLoaded: signal(false), sellerDetailLoading: signal(false), sellerPerformanceData: signal([])
});
test('leaving a section cancels its generation and permits a fresh load', () => {
  const scope = new SectionLoads(), old = scope.signal;
  scope.release();
  assert.equal(old.aborted, true);
  assert.notEqual(old, scope.signal);
  assert.equal(scope.signal.aborted, false);
});
test('a late seller response cannot repopulate memory or clear the new load', async () => {
  const subject = sellerSubject();
  const resolve = [];
  subject.loadDetail = () => new Promise(done => resolve.push(done));
  const oldLoad = subject.ensureSellerDetail();
  subject.sectionLoads.release(); subject.sellerDetailPromise = undefined;
  const newLoad = subject.ensureSellerDetail(), newPromise = subject.sellerDetailPromise;
  resolve[0]({ sellerPerformance: [{ seller: 'Old' }] });
  await oldLoad;
  assert.deepEqual(subject.sellerPerformanceData(), []);
  assert.equal(subject.sellerDetailPromise, newPromise);
  assert.equal(subject.sellerDetailLoading(), true);
  resolve[1]({ sellerPerformance: [{ seller: 'New' }] });
  await newLoad;
  assert.equal(subject.sellerPerformanceData()[0].seller, 'New');
  assert.equal(subject.sellerDetailLoading(), false);
});
test('section release clears product arrays, indexes and loaded flags', () => {
  const subject = new exports.Subject();
  subject.sectionLoads = new SectionLoads();
  subject.data = signal({ monthlyBrand: [], monthlySubline: [] });
  subject.indexPeriodStore = () => new Map();
  const signals = ['stockProductsData', 'staticPredictiveProductsData', 'stockOriginData', 'sellerPerformanceData', 'priceRangeData'];
  signals.forEach(name => { subject[name] = signal([{ productId: 'SKU' }]); });
  const maps = ['stockProductsByStore', 'stockProductsByCategory', 'predictiveProductsByProduct', 'monthlyPriceRangeIndex'];
  maps.forEach(name => { subject[name] = new Map([['SKU', [{}]]]); });
  // All remaining computed values and status signals in this method can use the same signal interface.
  const proxy = new Proxy(subject, { get(target, key) {
    if (!(key in target)) target[key] = signal(true);
    return target[key];
  } });
  proxy.hierarchyDetailTimer = undefined;
  const oldSignal = subject.sectionLoads.signal;
  proxy.releaseSectionDetails();
  assert.equal(oldSignal.aborted, true);
  signals.forEach(name => assert.equal(subject[name]().length, 0));
  maps.forEach(name => assert.equal(subject[name].size, 0));
  assert.equal(subject.stockDetailLoaded(), false);
  assert.equal(subject.sellerDetailLoaded(), false);
});
test('a canceled source lookup never starts a download', async () => {
  const subject = new exports.Subject();
  const controller = new AbortController();
  let finish;
  subject.cloud = { jsonSource: () => new Promise(resolve => { finish = resolve; }) };
  const load = subject.loadDetail('dashboard-stock-products.json', controller.signal);
  controller.abort(); finish({ urls: [] });
  await assert.rejects(load, error => error.name === 'AbortError');
});
