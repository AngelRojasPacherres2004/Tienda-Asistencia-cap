import ExcelJS from 'exceljs';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';

const source = process.argv.find(value => value.toLowerCase().endsWith('.xlsx') && !value.startsWith('--layer1='));
const layer1 = process.argv.find(value => value.startsWith('--layer1='))?.slice(9);
const python = process.argv.find(value => value.startsWith('--python='))?.slice(9);
const from = process.argv.find(value => value.startsWith('--from='))?.slice(7);
const to = process.argv.find(value => value.startsWith('--to='))?.slice(5);
const apply = process.argv.includes('--apply');
if (!source || !layer1 || !python || !/^\d{4}-\d{2}-\d{2}$/.test(from || '')
  || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || from > to) {
  throw new Error('Indica origen.xlsx --layer1=RUTA --python=RUTA --from=AAAA-MM-DD --to=AAAA-MM-DD.');
}
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Z0-9]+/gi, ' ').trim().replace(/\s+/g, ' ').toUpperCase();
const aliases = new Map(Object.entries({
  'LA MARINA': 'MARINA', 'JR DE LA UNION 797': 'JR UNION',
  'UNION 797': 'JR UNION', 'PLAZA UNION': 'PZA UNION',
  'AGUAS VERDES': 'TUMBES', 'ARAMBURU': 'ARAMBURU',
  'PTE PIEDRA': 'PUENTE PIEDRA',
  'ALF UGARTE': 'ALFONSO UGARTE',
}));
const canonical = value => aliases.get(normalize(value)) || normalize(value);
const root = path.resolve(path.dirname(layer1), '..');
const exportScript = path.join(root, 'piplines', 'exportar_trafico_capa1.py');
const previous = JSON.parse(execFileSync(path.resolve(python), [exportScript, path.resolve(layer1)],
  { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }));
const names = new Map(previous.map(row => [canonical(row.store), row.store]));
if (names.size < 17) throw new Error('El padrón de tiendas de Capa 1 está incompleto.');
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(path.resolve(source));
const replacement = new Map();
const sourceStores = new Set();
for (const sheet of workbook.worksheets) {
  const header = sheet.getRow(1);
  for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex++) {
    const row = sheet.getRow(rowIndex);
    const rawDate = row.getCell(1).value;
    if (!(rawDate instanceof Date)) continue;
    const day = rawDate.toISOString().slice(0, 10);
    if (day < from || day > to) continue;
    for (let column = 2; column <= sheet.columnCount; column++) {
      const heading = header.getCell(column).value;
      if (!heading) continue;
      const store = names.get(canonical(heading));
      if (!store) throw new Error(`Tienda de origen sin homologar: ${heading}`);
      const value = row.getCell(column).value;
      if (value !== null && value !== undefined && value !== ''
        && (!Number.isSafeInteger(value) || value < 0)) {
        throw new Error(`Conteo inválido en ${sheet.name}, ${day}, ${store}.`);
      }
      const key = `${day}|${store}`;
      if (replacement.has(key)) throw new Error(`Día y tienda duplicados: ${key}`);
      replacement.set(key, { date: day, store, quantity: value === '' ? null : value ?? null,
        state: value === '' || value == null ? 'SIN INFORMACIÓN' : 'REGISTRADO' });
      sourceStores.add(store);
    }
  }
}
if (sourceStores.size < 15) throw new Error('El origen no contiene suficientes tiendas.');
const selectedDays = new Set([...replacement.values()].map(row => row.date));
for (let stamp = Date.parse(`${from}T00:00:00Z`); stamp <= Date.parse(`${to}T00:00:00Z`); stamp += 86400000) {
  const day = new Date(stamp).toISOString().slice(0, 10);
  if (!selectedDays.has(day)) throw new Error(`Falta el día ${day} en el Excel de tráfico.`);
}
const merged = new Map(previous.map(row => [`${row.date}|${row.store}`, row]));
for (const [key, row] of replacement) merged.set(key, row);
for (const day of selectedDays) {
  for (const store of names.values()) {
    const key = `${day}|${store}`;
    if (!merged.has(key)) merged.set(key, { date: day, store, quantity: null, state: 'SIN INFORMACIÓN' });
  }
}
const rows = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date) || a.store.localeCompare(b.store));
const sourceTotal = [...replacement.values()].reduce((sum, row) => sum + (row.quantity ?? 0), 0);
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', from, to,
  sourceStores: sourceStores.size, sourceDays: selectedDays.size, sourceTotal,
  affectedRows: replacement.size, layer1Rows: rows.length }));
if (!apply) process.exit(0);
const output = new ExcelJS.Workbook();
const sheet = output.addWorksheet('TRAFICO_CLIENTE');
sheet.addRow(['fecha', 'tienda', 'cantidad_personas', 'estado_registro']);
for (const row of rows) {
  sheet.addRow([new Date(`${row.date}T00:00:00Z`), row.store, row.quantity, row.state]);
}
sheet.getColumn(1).numFmt = 'yyyy-mm-dd';
const backups = path.join(root, '.etl_work', 'traffic-layer1-backups');
await mkdir(backups, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(backups, `TRAFICO_CLIENTES-before-${stamp}.xlsx`);
const temporary = path.join(backups, `TRAFICO_CLIENTES-next-${stamp}.xlsx`);
await output.xlsx.writeFile(temporary);
const check = new ExcelJS.Workbook();
await check.xlsx.readFile(temporary);
if (check.getWorksheet('TRAFICO_CLIENTE')?.rowCount !== rows.length + 1) {
  throw new Error('La verificación del Excel normalizado falló; no se reemplazó Capa 1.');
}
await copyFile(path.resolve(layer1), backup);
await copyFile(temporary, path.resolve(layer1));
await unlink(temporary);
console.log(JSON.stringify({ updated: path.resolve(layer1), backup }));
