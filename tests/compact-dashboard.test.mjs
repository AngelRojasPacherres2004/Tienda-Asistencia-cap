import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeCompactRows, decodeDailyCompact, decodePredictiveCompact, decodeStockCompact, decodeSizeCompact } from '../src/commercial/compact-dashboard.ts';

test('compact dashboard rows restore repeated dimensions and numeric values', () => {
  const payload = {
    encoding: 'dictionary-v1',
    columns: ['periodId', 'storeId', 'category', 'net', 'units'],
    dictionary: { periodId: [202601], storeId: ['T001', 'T002'], category: ['TEXTIL'] },
    rows: [[0, 0, 0, 12.5, 2], [0, 1, 0, 7, 1]],
  };
  assert.deepEqual(decodeCompactRows(payload), [
    { periodId: 202601, storeId: 'T001', category: 'TEXTIL', net: 12.5, units: 2 },
    { periodId: 202601, storeId: 'T002', category: 'TEXTIL', net: 7, units: 1 },
  ]);
});

test('compact dashboard rejects malformed and unsafe records', () => {
  const base = { encoding: 'dictionary-v1', columns: ['storeId'], dictionary: { storeId: ['T001'] } };
  assert.throws(() => decodeCompactRows({ ...base, rows: [[1]] }), /Índice/);
  assert.throws(() => decodeCompactRows({ ...base, rows: [[]] }), /incompleta/);
  assert.throws(() => decodeCompactRows({ ...base, columns: ['__proto__'], rows: [[0]] }), /no válida/);
});

test('grouped seller rows preserve shared dimensions and optional transactions', () => {
  const payload = {
    encoding: 'seller-grouped-v1',
    groupColumns: ['periodId', 'storeId', 'category', 'line', 'subline'],
    dictionary: { periodId: [202601], storeId: ['T001'], category: ['TEXTIL'], line: ['A'], subline: ['BVD'], seller: ['ANA', 'LUZ'] },
    groups: [[0, 0, 0, 0, 0]],
    rows: [[0, 0, 12.5, 2], [0, 1, 7, 3, 2]],
  };
  const rows = decodeCompactRows(payload);
  assert.equal(rows[0].transactions, 2);
  assert.equal(rows[1].transactions, 2);
  assert.equal(rows[1].seller, 'LUZ');
  assert.equal(rows[0].subline, 'BVD');
});

test('daily rows restore derived periods, omitted zeros and hourly sales', () => {
  const payload = {
    encoding: 'daily-v1',
    dictionary: { date: ['2025-12-24'], storeId: ['T001'], category: ['TEXTIL'], line: ['A'], subline: ['BVD'], brand: ['Z'] },
    dailyStore: [[0, 0, 0, 0, 0, 0, 1, 12, 10, 0, 2, 1, 2, 0], [0, 0, 0, 0, 0, 0, 1, 12, 10, 0, 2, 1, 2, 17, 9, 5]],
    hourlySales: [[0, 0, 9, 1, 10]],
  };
  const result = decodeDailyCompact(payload);
  assert.equal(result.dailyStore[0].periodId, 202512);
  assert.equal(result.dailyStore[0].net, 10);
  assert.equal(result.dailyStore[0].target, 0);
  assert.equal(result.dailyStore[1].net, 9);
  assert.equal(result.dailyStore[1].received, 5);
  assert.equal(result.hourlySales[0].date, '2025-12-24');
  assert.equal(result.hourlySales[0].periodId, 202512);
  assert.deepEqual(result.hourlySales[0], { date: '2025-12-24', periodId: 202512, storeId: 'T001', hour: 9, transactions: 1, net: 10 });
});

test('stock rows restore shared SKU metadata and sparse quantities', () => {
  const rows = decodeStockCompact({
    encoding: 'stock-v1', stores: ['T001', 'T002'],
    products: [['P1', '00000000001007', 'ZAPATO 7', 'CALZADO', 'DAMAS', 'ZAPATOS', 'MARCA']],
    rows: [[0, 0, 4, 0], [1, 0, 2, 17, 100, 1]],
  });
  assert.equal(rows[0].goodUnits, 4);
  assert.equal(rows[0].stockValue, 0);
  assert.equal(rows[1].stockValue, 100);
  assert.equal(rows[1].units30, 1);
  assert.equal(rows[1].productCode, '00000000001007');
  assert.throws(() => decodeStockCompact({ encoding: 'stock-v1', stores: ['T001'], products: [], rows: [[0, 9, 4, 0]] }));
});

test('size rows keep Nissei code and filter dimensions for one rubro', () => {
  const rows = decodeSizeCompact({ encoding: 'sizes-v1', category: 'CALZADO', stores: ['T001'],
    products: [['P1', '00000000001007', 'ZAPATO 7', 'DAMAS', 'ZAPATOS']],
    rows: [[0, 0, 3, 2]] });
  assert.deepEqual(rows[0], { storeId: 'T001', productId: 'P1', productCode: '00000000001007',
    product: 'ZAPATO 7', category: 'CALZADO', line: 'DAMAS', subline: 'ZAPATOS', brand: 'SIN MARCA', stockUnits: 3, units30: 2, units90: 2 });
  const newRows = decodeSizeCompact({ encoding: 'sizes-v1', category: 'CALZADO', stores: ['T001'],
    products: [['P1', '00000000001007', 'ZAPATO 7', 'DAMAS', 'ZAPATOS', 'MARCA A']], rows: [[0, 0, 3, 2, 6]] });
  assert.equal(newRows[0].brand, 'MARCA A');
  assert.equal(newRows[0].units90, 6);
  const dictionaryRows = decodeSizeCompact({ encoding: 'sizes-v1', category: 'CALZADO', stores: ['T001'],
    dictionary: { line: ['DAMAS'], subline: ['ZAPATOS'], brand: ['MARCA A'] },
    products: [['P1', '00000000001007', 'ZAPATO 7', 0, 0, 0]], rows: [[0, 0, 3, 2, 6]] });
  assert.equal(dictionaryRows[0].brand, 'MARCA A');
  assert.equal(dictionaryRows[0].line, 'DAMAS');
});

test('predictive rows restore zero windows, growth and sparse spoilage', () => {
  const result = decodePredictiveCompact({
    encoding: 'predictive-v1', note: 'Corte fijo',
    dictionary: { storeId: ['T001'], productId: ['P1', 'P2'] },
    rows: [[0, 0, 0], [0, 1, 11, 3, 5, 1]],
  });
  assert.equal(result.note, 'Corte fijo');
  assert.equal(result.rows[0].units90, 0);
  assert.equal(result.rows[1].units60, 3);
  assert.equal(result.rows[1].units90, 5);
  assert.equal(result.rows[1].merma60, 1);
  assert.equal(result.rows[1].merma90, 0);
});
