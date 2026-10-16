import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePriceRanges, personnelGenderCounts, stockByStore } from '../commercial-dashboard/src/app/commercial-analysis.ts';

test('la comparación anual conserva rangos y distingue ausencia de datos de cero medido', () => {
  const result = comparePriceRanges([{ bandOrder: 1, net: 150, units: 5 }, { bandOrder: 2, net: 50, units: 1 }],
    [{ bandOrder: 1, net: 100, units: 4 }]);
  assert.equal(result.length, 11);
  assert.equal(result[0].change, 0.5);
  assert.equal(result[0].share, 0.75);
  assert.equal(result[0].averagePrice, 30);
  assert.equal(result[1].comparisonNet, 0);
  assert.equal(result[1].change, null);
  assert.equal(comparePriceRanges([{ bandOrder: 1, net: 150, units: 5 }], [])[0].comparisonNet, null);
  assert.equal(comparePriceRanges([], [{ bandOrder: 1, net: 100, units: 4 }])[0].available, false);
  assert.equal(comparePriceRanges([], [{ bandOrder: 1, net: 100, units: 4 }])[0].change, null);
});

test('la agrupación por tienda reconcilia unidades y valor sin sumar snapshots de venta', () => {
  const rows = [{ storeId: 'A', units: 4, value: 40 }, { storeId: 'B', units: 9, value: 180 }, { storeId: 'A', units: 3, value: 45 }];
  const result = stockByStore(rows, [{ storeId: 'A', store: 'Alfa' }, { storeId: 'B', store: 'Beta' }]);
  assert.deepEqual(result.map(row => row.label), ['Beta', 'Alfa']);
  assert.equal(result.reduce((sum, row) => sum + row.units, 0), 16);
  assert.equal(result.reduce((sum, row) => sum + row.value, 0), 265);
});

test('género normaliza solo registros explícitos y conserva los casos sin especificar', () => {
  const result = personnelGenderCounts(['M', 'F', 'masculino', ' FEMENINO ', 'N/A', null, 'nombre cualquiera'].map(gender => ({ gender })));
  assert.deepEqual(result, { male: 2, female: 2, unspecified: 3, total: 7 });
  assert.equal(result.male + result.female + result.unspecified, result.total);
});
