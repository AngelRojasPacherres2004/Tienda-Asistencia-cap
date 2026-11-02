import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createExcelDomain } from '../netlify/domains/excel.js';
import { createPersonnelDomain } from '../netlify/domains/personnel.js';
import { storePersonnelColumns, storePersonnelLists, personnelChoiceLabel } from '../shared/store-personnel.js';

const excel = createExcelDomain({ createExcelWorkbook: async () => new ExcelJS.Workbook() });
const response = await excel.exportStoreUsersExcel({ tienda_id: 1 }, true);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(Buffer.from(response.body, 'base64'));
const sheet = workbook.getWorksheet('Usuarios');
assert.deepEqual(sheet.getRow(1).values.slice(1), storePersonnelColumns.map(([label]) => label));
const columnFor = key => storePersonnelColumns.findIndex(([, field]) => field === key) + 1;
for (const [key, choices] of Object.entries(storePersonnelLists)) {
  for (const row of [2, 501]) {
    const validation = sheet.getCell(row, columnFor(key)).dataValidation;
    assert.equal(validation.type, 'list');
    assert.ok(workbook.definedNames.getRanges(validation.formulae[0]).ranges.length);
  }
  const index = Object.keys(storePersonnelLists).indexOf(key) + 1;
  assert.deepEqual(workbook.getWorksheet('Listas').getColumn(index).values.slice(2), choices.map(value => personnelChoiceLabel(key, value)));
}
assert.equal(sheet.getCell(2, columnFor('regimen_jornada')).dataValidation.type, 'decimal');
const password = sheet.getCell(2, columnFor('password')).dataValidation;
assert.match(password.formulae[0], />=3/);

let inserted;
const query = { select() { return this; }, in() { return Promise.resolve({ data: [], error: null }); }, async insert(rows) { inserted = rows; return { error: null }; } };
const personnel = createPersonnelDomain({
  supabase: { from: () => query }, bodyOf: value => value,
  cleanText: value => String(value ?? '').trim(), cleanUsuario: value => String(value ?? '').trim().toLowerCase(),
  httpError: (message, status) => Object.assign(new Error(message), { status }),
  hashOperationalPassword: async () => null,
  validateUserPayload(data) { if (data.regimen_jornada) data.regimen_jornada = String(data.regimen_jornada).replace(/h$/, '') + 'h'; },
});
const row = { nombres: 'Ana', apellidos: 'Prueba', dni: '12345678', fecha_ingreso: '2026-10-30', rol: 'Vendedor', regimen_jornada: 7.5, tipo_turno: 'Cierre', talla_polo: 'M', tiene_parentesco: 'Sí', tipo_parentesco: 'Hermano / hermana', familiar_vinculo: 'Luis Prueba' };
await personnel.importStoreUsers({ usuarios: [row] }, { tienda_id: 9, rol: 'jefe_tienda' });
assert.equal(inserted[0].regimen_jornada, '7.5h');
assert.equal(inserted[0].tipo_turno, 'cierre');
assert.equal(inserted[0].talla_polo, 'm');
assert.equal(inserted[0].rol, 'vendedor');
assert.equal(inserted[0].tiene_parentesco, true);
assert.equal(inserted[0].tipo_parentesco, 'hermano_hermana');
assert.equal(inserted[0].tienda_id, 9);
assert.equal(inserted[0].sexo, 'no_especificado');
await personnel.importStoreUsers({ usuarios: [{ nombres: 'Ana', apellidos: 'Prueba', dni: '12345678', fecha_ingreso: '2026-10-30' }] }, { tienda_id: 9, rol: 'jefe_tienda' });
assert.equal(inserted[0].rol, 'trabajador');
await assert.rejects(personnel.importStoreUsers({ usuarios: [{ ...row, rol: 'gerencia_general' }] }, { tienda_id: 9, rol: 'jefe_tienda' }), /no es válido/);
console.log('Plantilla Excel: listas, validaciones e importación de los nuevos campos comprobadas.');
