import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { SectionLoads } from '../commercial-dashboard/src/app/section-loads.ts';
import { decodeCompactRows, decodeStockCompact } from '../commercial-dashboard/src/app/compact-dashboard.ts';

const require = createRequire(new URL('../commercial-dashboard/package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../commercial-dashboard/src/app/app.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('app.ts', source, ts.ScriptTarget.Latest, true);
const app = tree.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'App');
const methods = ['ensureSellerDetail', 'ensurePriceRangeDetail', 'ensureBrandDetail', 'ensureStockHierarchy', 'ensureStockTransfers', 'deferHierarchyDetails', 'loadDetail', 'loadYearDetail', 'cancelPendingSectionLoads', 'releaseSectionDetails'];
const code = ts.transpileModule(`export class Subject {${app.members.filter(member => methods.includes(member.name?.getText(tree))).map(member => member.getText(tree)).join('\n')}}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(code.replaceAll('import.meta.url', JSON.stringify(import.meta.url)), {
  exports, URL, Worker: undefined, AbortController, DOMException, decodeCompactRows, decodeStockCompact,
  setTimeout: callback => { callback(); return 1; }, clearTimeout: () => undefined,
});
const signal = initial => {
  let value = initial;
  const read = () => value;
  read.set = next => { value = next; };
  read.update = callback => { value = callback(value); };
  return read;
};
const sellerSubject = () => Object.assign(new exports.Subject(), {
  sectionLoads: new SectionLoads(), year: signal(2026), selectedMonths: signal([]),
  selectedCategories: signal([]), selectedLines: signal([]), selectedSublines: signal([]),
  sellerDetailGeneration: 0, sellerDetailLoaded: signal(false), sellerDetailLoading: signal(false), sellerPerformanceData: signal([])
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
  subject.sellerDetailAbort.abort(); subject.sellerDetailGeneration += 1; subject.sellerDetailPromise = undefined;
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
test('seller ranking uses compact yearly and category summaries before detailed hierarchy', async () => {
  const subject = sellerSubject();
  const requested = [];
  subject.loadDetail = async file => {
    requested.push(file);
    return { sellerPerformance: [{ periodId: 202602, storeId: 'T001', seller: 'ANA', net: 10 }] };
  };
  await subject.ensureSellerDetail();
  assert.deepEqual(requested, ['dashboard-sellers-summary-2026.json']);
  subject.sellerDetailLoaded.set(false); subject.sellerDetailPromise = undefined;
  subject.selectedCategories.set(['TEXTIL']); subject.selectedMonths.set([2]);
  await subject.ensureSellerDetail();
  assert.deepEqual(requested, ['dashboard-sellers-summary-2026.json', 'dashboard-sellers-category-2026.json']);
  subject.sellerDetailLoaded.set(false); subject.sellerDetailPromise = undefined;
  subject.selectedLines.set(['A']);
  await subject.ensureSellerDetail();
  assert.equal(requested.at(-1), 'dashboard-sellers-2026-02.json');
  assert.equal(subject.sellerPerformanceData()[0].seller, 'ANA');
});

test('category summaries fall back to annual data from an older publication', async () => {
  const seller = sellerSubject();
  seller.selectedCategories.set(['TEXTIL']);
  seller.loadDetail = async () => { throw new Error('404'); };
  seller.loadYearDetail = async () => [{ periodId: 202601, storeId: 'T001', category: 'TEXTIL', seller: 'ANA', net: 10 }];
  await seller.ensureSellerDetail();
  assert.equal(seller.sellerPerformanceData()[0].seller, 'ANA');

  const price = sellerSubject();
  price.selectedCategories.set(['TEXTIL']);
  price.priceRangeDetailGeneration = 0;
  price.priceRangeData = signal([]);
  price.priceRangeDetailLoaded = signal(false);
  price.effectivePriceRangeComparisonYear = () => 2025;
  price.loadDetail = async () => { throw new Error('404'); };
  price.loadYearDetail = async () => [{ periodId: 202601, storeId: 'T001', category: 'TEXTIL', bandOrder: 1, net: 4 }];
  price.indexPeriodStoreAsync = async () => new Map();
  await price.ensurePriceRangeDetail();
  assert.equal(price.priceRangeData()[0].net, 4);
});

test('annual hierarchy detail prefers compact rows and restores every dimension', async () => {
  const subject = sellerSubject();
  const requested = [];
  subject.loadDetail = async name => {
    requested.push(name);
    return { monthlySubline: {
      encoding: 'dictionary-v1',
      columns: ['periodId', 'storeId', 'category', 'line', 'subline', 'net'],
      dictionary: { periodId: [202601], storeId: ['T001'], category: ['TEXTIL'], line: ['A'], subline: ['BVD'] },
      rows: [[0, 0, 0, 0, 0, 19.5]],
    } };
  };
  const rows = await subject.loadYearDetail('dashboard-subline.json', 'monthlySubline', [2026]);
  assert.deepEqual(requested, ['dashboard-subline-compact-2026.json']);
  assert.equal(rows[0].subline, 'BVD');
  assert.equal(rows[0].net, 19.5);
});
test('price range uses compact yearly and category summaries before line detail', async () => {
  const subject = sellerSubject();
  const requested = [];
  subject.priceRangeDetailGeneration = 0;
  subject.priceRangeData = signal([]);
  subject.priceRangeDetailLoaded = signal(false);
  subject.effectivePriceRangeComparisonYear = () => 2025;
  subject.indexPeriodStoreAsync = async rows => new Map(rows.map(row => [String(row.periodId), [row]]));
  subject.loadDetail = async file => {
    requested.push(file);
    const year = Number(file.match(/(\d{4})\.json$/)?.[1]);
    return { monthlyPriceRange: [{ periodId: year * 100 + 1, storeId: 'T001', bandOrder: 1, net: 10 }] };
  };
  await subject.ensurePriceRangeDetail();
  assert.deepEqual(requested.sort(), ['dashboard-price-range-summary-2025.json', 'dashboard-price-range-summary-2026.json']);
  assert.equal(subject.priceRangeData().length, 2);
  subject.priceRangeDetailLoaded.set(false); subject.priceRangeDetailPromise = undefined;
  subject.selectedCategories.set(['TEXTIL']);
  subject.loadYearDetail = async (_file, _key, years) => {
    requested.push(`detail:${years.join(',')}`);
    return [{ periodId: 202601, storeId: 'T001', category: 'TEXTIL', bandOrder: 1, net: 4 }];
  };
  await subject.ensurePriceRangeDetail();
  assert.deepEqual(requested.slice(-2).sort(), ['dashboard-price-range-category-2025.json', 'dashboard-price-range-category-2026.json']);
  subject.priceRangeDetailLoaded.set(false); subject.priceRangeDetailPromise = undefined;
  subject.selectedLines.set(['A']);
  await subject.ensurePriceRangeDetail();
  assert.equal(requested.at(-1), 'detail:2026,2025');
  assert.equal(subject.priceRangeData()[0].net, 4);
  subject.priceRangeDetailLoaded.set(false); subject.priceRangeDetailPromise = undefined;
  subject.selectedMonths.set([2]);
  await subject.ensurePriceRangeDetail();
  assert.deepEqual(requested.slice(-2).sort(), [
    'dashboard-price-range-2025-02.json', 'dashboard-price-range-2026-02.json',
  ]);
});
test('brand category filter loads the compact rubro summary and line filter loads detail', async () => {
  const subject = sellerSubject();
  const requested = [];
  subject.brandDetailGeneration = 0;
  subject.brandDetailLoaded = signal(false);
  subject.loadingError = signal('');
  subject.indexPeriodStoreAsync = async rows => new Map(rows.map(row => [String(row.periodId), [row]]));
  subject.selectedCategories.set(['TEXTIL']);
  subject.loadDetail = async file => {
    requested.push(file);
    return { monthlyBrand: [{ periodId: 202601, storeId: 'T001', category: 'TEXTIL', brand: 'Z', net: 10 }] };
  };
  await subject.ensureBrandDetail();
  assert.deepEqual(requested, ['dashboard-brand-category-2026.json']);
  assert.equal(subject.monthlyBrandIndex.get('202601')[0].net, 10);
  subject.brandDetailLoaded.set(false); subject.brandDetailPromise = undefined;
  subject.selectedLines.set(['A']);
  subject.loadYearDetail = async () => {
    requested.push('full-year');
    return [{ periodId: 202601, storeId: 'T001', category: 'TEXTIL', line: 'A', brand: 'Z', net: 4 }];
  };
  await subject.ensureBrandDetail();
  assert.equal(requested.at(-1), 'full-year');
  assert.equal(subject.monthlyBrandIndex.get('202601')[0].net, 4);
});
test('category and line filters do not request the subline dataset', () => {
  const subject = sellerSubject();
  const requested = [];
  subject.ensureBrandDetail = () => { requested.push('brand'); };
  subject.ensureSublineDetail = () => { requested.push('subline'); };
  subject.selectedCategories.set(['TEXTIL']);
  subject.deferHierarchyDetails();
  assert.deepEqual(requested, ['brand']);
  subject.selectedSublines.set(['CAMISA']);
  subject.deferHierarchyDetails();
  assert.deepEqual(requested.slice(1), ['subline', 'brand']);
});
test('section release clears product arrays, indexes and loaded flags', () => {
  const subject = new exports.Subject();
  subject.sectionLoads = new SectionLoads();
  subject.data = signal({ monthlyBrand: [], monthlySubline: [] });
  subject.indexPeriodStore = () => new Map();
  const signals = ['stockProductsData', 'staticPredictiveProductsData', 'stockOriginData', 'stockHierarchyData', 'stockTransferProductsData', 'sellerPerformanceData', 'priceRangeData'];
  signals.forEach(name => { subject[name] = signal([{ productId: 'SKU' }]); });
  const maps = ['stockProductsByStore', 'stockProductsByCategory', 'predictiveProductsByProduct', 'monthlyPriceRangeIndex'];
  maps.forEach(name => { subject[name] = new Map([['SKU', [{}]]]); });
  // All remaining computed values and status signals in this method can use the same signal interface.
  const proxy = new Proxy(subject, { get(target, key) {
    if (!(key in target)) target[key] = signal(true);
    return target[key];
  } });
  proxy.hierarchyDetailTimer = undefined;
  proxy.sellerDetailAbort = undefined;
  proxy.priceRangeDetailAbort = undefined;
  proxy.brandDetailAbort = undefined;
  proxy.sizeDetailPromises = new Map();
  let observerDisconnected = false;
  proxy.stockDetailObserver = { disconnect: () => { observerDisconnected = true; } };
  const oldSignal = subject.sectionLoads.signal;
  proxy.releaseSectionDetails();
  assert.equal(oldSignal.aborted, true);
  assert.equal(observerDisconnected, true);
  signals.forEach(name => assert.equal(subject[name]().length, 0));
  maps.forEach(name => assert.equal(subject[name].size, 0));
  assert.equal(subject.stockDetailLoaded(), false);
  assert.equal(subject.stockHierarchyLoaded(), false);
  assert.equal(subject.stockTransfersLoaded(), false);
  assert.equal(subject.sellerDetailLoaded(), false);
});

test('inventory hierarchy loads a small exact aggregate before product detail', async () => {
  const subject = new exports.Subject();
  subject.sectionLoads = new SectionLoads();
  subject.stockHierarchyData = signal([]);
  subject.stockHierarchyLoaded = signal(false);
  const requested = [];
  subject.loadDetail = async file => {
    requested.push(file);
    return { stockHierarchy: { encoding: 'dictionary-v1',
      columns: ['storeId', 'category', 'line', 'subline', 'brand', 'stockUnits', 'stockValue', 'goodUnits', 'units30', 'sales30'],
      dictionary: { storeId: ['T001'], category: ['CALZADO'], line: ['DAMA'], subline: ['ZAPATOS'], brand: ['MARCA'] },
      rows: [[0, 0, 0, 0, 0, 4, 100, 4, 1, 25]] } };
  };
  await subject.ensureStockHierarchy();
  assert.deepEqual(requested, ['dashboard-stock-hierarchy.json']);
  assert.equal(subject.stockHierarchyData()[0].stockValue, 100);
  assert.equal(subject.stockHierarchyLoaded(), true);
});

test('transfer modal loads only candidate SKUs from the compact file', async () => {
  const subject = new exports.Subject();
  subject.cloud = { accessProfile: () => null };
  subject.sectionLoads = new SectionLoads();
  subject.stockDetailLoaded = signal(false);
  subject.stockTransfersLoaded = signal(false);
  subject.stockTransferProductsData = signal([]);
  const requested = [];
  subject.loadDetail = async file => {
    requested.push(file);
    return { stockCompact: { encoding: 'stock-v1', stores: ['T001'],
      products: [['P1', '00000000001007', 'ZAPATO', 'CALZADO', 'DAMA', 'ZAPATOS', 'MARCA']],
      rows: [[0, 0, 5, 0]] } };
  };
  await subject.ensureStockTransfers();
  assert.deepEqual(requested, ['dashboard-stock-transfers.json']);
  assert.equal(subject.stockTransferProductsData()[0].productId, 'P1');
  assert.equal(subject.stockTransfersLoaded(), true);
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

test('store transfer detail uses authorized server routes instead of a scoped stock file', async () => {
  const subject = new exports.Subject();
  subject.sectionLoads = new SectionLoads();
  subject.stockTransfersLoaded = signal(false);
  subject.stockTransferProductsData = signal([]);
  subject.storeTransferRoutes = signal(null);
  subject.storeTransferStores = signal([]);
  subject.cloud = { accessProfile: () => ({ scopeType: 'store' }), storeTransfers: async () => ({ products: [{ productId: 'P1' }], stores: [{ storeId: 'A' }], routes: [{ source: 'A', destination: 'B' }] }) };
  subject.loadDetail = async () => { throw new Error('Unexpected scoped stock download'); };
  await subject.ensureStockTransfers();
  assert.equal(subject.stockTransfersLoaded(), true);
  assert.equal(subject.storeTransferRoutes()[0].destination, 'B');
  assert.equal(subject.stockTransferProductsData()[0].productId, 'P1');
});
test('el inventario queda disponible antes de enriquecer códigos Nissei', () => {
  const start = source.indexOf('private async ensureStockDetail');
  const end = source.indexOf('private async enrichProductCodes', start);
  const method = source.slice(start, end);
  assert.ok(method.indexOf('this.stockDetailLoaded.set(true)') < method.indexOf('void this.enrichProductCodes'));
  assert.equal(method.includes('await this.cloud.productCodes'), false);
});

test('los detalles anuales descargan solo los años solicitados', async () => {
  const subject = new exports.Subject();
  const requested = [];
  subject.loadDetail = async file => {
    requested.push(file);
    const year = Number(file.match(/(\d{4})\.json$/)?.[1]);
    return { rows: [{ periodId: year * 100 + 1, storeId: 'T001' }] };
  };
  const rows = await subject.loadYearDetail('dashboard-detail.json', 'rows', [2026, 2025, 2026]);
  assert.deepEqual(requested.sort(), ['dashboard-detail-2025.json', 'dashboard-detail-2026.json']);
  assert.deepEqual(Array.from(rows, row => row.periodId).sort(), [202501, 202601]);
});

test('una publicación antigua usa el monolito y filtra los años requeridos', async () => {
  const subject = new exports.Subject();
  const requested = [];
  subject.loadDetail = async file => {
    requested.push(file);
    if (file !== 'dashboard-detail.json') throw new Error('no existe partición');
    return { rows: [{ periodId: 202401 }, { periodId: 202501 }, { periodId: 202601 }] };
  };
  const rows = await subject.loadYearDetail('dashboard-detail.json', 'rows', [2025]);
  assert.deepEqual(requested, ['dashboard-detail-2025.json', 'dashboard-detail.json']);
  assert.deepEqual(Array.from(rows, row => row.periodId), [202501]);
});
