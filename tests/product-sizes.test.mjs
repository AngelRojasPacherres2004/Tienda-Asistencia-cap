import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOOTWEAR_SIZE_GUIDE,
  nisseiSizeCode,
  normalizeSizeGender,
  resolveProductSize,
} from '../commercial-dashboard/src/app/product-sizes.ts';

const canonicalCode = suffix => `${'0'.repeat(11)}${suffix}`;

test('extracts the final three characters only from canonical 14-character Nissei codes', () => {
  assert.equal(nisseiSizeCode('00000000000007'), '007');
  assert.equal(nisseiSizeCode(canonicalCode('0XL')), '0XL');
  assert.equal(nisseiSizeCode('AB'), null);
  assert.equal(nisseiSizeCode('00023C7003'), null);
  assert.equal(nisseiSizeCode('12345678901'), null);
});

test('maps the same USA suffix to the correct EUR size by footwear gender', () => {
  const code = '00000000000007';
  assert.equal(resolveProductSize({ productCode: code, line: 'CALZADO CABALLERO' }, 'CALZADO', 'EUR')?.label, '40');
  assert.equal(resolveProductSize({ productCode: code, line: 'DAMA' }, 'CALZADO', 'EUR')?.label, '37');
  assert.equal(resolveProductSize({ productCode: code, line: 'BEBE' }, 'CALZADO', 'EUR')?.label, '23');
  assert.equal(resolveProductSize({ productCode: code, line: 'DAMA' }, 'CALZADO', 'USA')?.label, '7');
});

test('uses all 54 footwear conversions supplied in the workbook guide', () => {
  assert.equal(FOOTWEAR_SIZE_GUIDE.length, 54);
  assert.equal(resolveProductSize({ productCode: '00000000000065', line: 'CABALLERO' }, 'CALZADO', 'USA')?.label, '6.5');
  assert.equal(resolveProductSize({ productCode: '00000000000145', line: 'CABALLERO' }, 'CALZADO', 'EUR')?.label, '48');
});

test('supports the planned textile convention by audience', () => {
  assert.equal(resolveProductSize({ productCode: '00000000000010', line: 'NIÑA' }, 'TEXTIL')?.label, '10');
  assert.equal(resolveProductSize({ productCode: '00000000000014', line: 'JOVENCITO' }, 'TEXTIL')?.label, '14');
  assert.equal(resolveProductSize({ productCode: '0000000000000M', line: 'DAMA' }, 'TEXTIL')?.label, 'M');
  assert.equal(resolveProductSize({ productCode: canonicalCode('2XL'), line: 'CABALLERO' }, 'TEXTIL')?.label, '2XL');
  assert.equal(resolveProductSize({ productCode: '00000000000010', line: 'DAMA' }, 'TEXTIL'), null);
});

test('normalizes the commercial line names used by the dashboard', () => {
  assert.equal(normalizeSizeGender('Niño'), 'KIDS');
  assert.equal(normalizeSizeGender('Jovencita'), 'JUVENIL');
  assert.equal(normalizeSizeGender('Moda femenina'), 'DAMA');
});
