import ExcelJS from 'exceljs';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Extiende únicamente los días posteriores al último corte de Capa 1.
const source = process.argv.find(value => value.toLowerCase().endsWith('.xlsx'));
const apply = process.argv.includes('--apply');
if (!source) throw new Error('Indica el Excel de tráfico e incidencias.');
const root = process.cwd();
const trafficPath = path.join(root, 'capa1', 'TRAFICO_CLIENTES.xlsx');
const lossPath = path.join(root, 'capa1', 'MERMA.xlsx');
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Z0-9]+/gi, ' ').trim().replace(/\s+/g, ' ').toUpperCase();
const aliases = new Map(Object.entries({
  'A UGARTE': 'ALFONSO UGARTE', 'ALF UGARTE': 'ALFONSO UGARTE',
  'P PIEDRA': 'PUENTE PIEDRA', 'PTE PIEDRA': 'PUENTE PIEDRA',
  'LA MARINA': 'MARINA', 'JR DE LA UNION 797': 'JR UNION',
  'JR DE LA UNION': 'JR UNION', 'PLAZA UNION': 'PZA UNION',
}));
const key = value => aliases.get(normalize(value)) || normalize(value);
const dateOf = value => value instanceof Date ? value.toISOString().slice(0, 10) : null;
const valueOf = cell => cell.value?.result ?? cell.value;
const pad = value => String(value).padStart(2, '0');

const workbooks = [];
for (const file of [source, lossPath]) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.resolve(file));
  workbooks.push(workbook);
}
const [input, loss] = workbooks;
const previousTraffic = JSON.parse(execFileSync('python', [path.join(root, 'piplines', 'exportar_trafico_capa1.py'), trafficPath],
  { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }));
const traffic = new ExcelJS.Workbook();
const trafficSheet = traffic.addWorksheet('TRAFICO_CLIENTE');
trafficSheet.addRow(['fecha', 'tienda', 'cantidad_personas', 'estado_registro']);
for (const row of previousTraffic) trafficSheet.addRow([new Date(`${row.date}T00:00:00Z`), row.store, row.quantity, row.state]);
const sourceTraffic = input.getWorksheet('TRÁFICO DE CLIENTES');
const sourceIncidents = input.getWorksheet('INCIDENCIAS');
const lossSheet = loss.getWorksheet('MERMA');
if (!sourceTraffic || !sourceIncidents || !trafficSheet || !lossSheet) throw new Error('Faltan hojas requeridas.');
const storeNames = new Map();
const existingTraffic = new Set();
let trafficCutoff = '';
for (let index = 2; index <= trafficSheet.rowCount; index++) {
  const row = trafficSheet.getRow(index);
  const date = dateOf(valueOf(row.getCell(1)));
  const store = String(valueOf(row.getCell(2)) ?? '').trim();
  if (!date || !store) continue;
  storeNames.set(key(store), store);
  existingTraffic.add(`${date}|${key(store)}`);
  if (date > trafficCutoff) trafficCutoff = date;
}
if (storeNames.size < 17) throw new Error('El padrón de tiendas de Capa 1 está incompleto.');
let lossCutoff = '';
for (let index = 2; index <= lossSheet.rowCount; index++) {
  const date = dateOf(valueOf(lossSheet.getRow(index).getCell(2)));
  if (date && date > lossCutoff) lossCutoff = date;
}

const newTraffic = new Map();
let week = -1;
let sourceTrafficCutoff = '';
for (let index = 1; index <= sourceTraffic.rowCount; index++) {
  const row = sourceTraffic.getRow(index);
  if (normalize(valueOf(row.getCell(1))).startsWith('TIENDAS')) { week++; continue; }
  if (week < 0) continue;
  const store = storeNames.get(key(valueOf(row.getCell(1))));
  const hasDailyValues = Array.from({ length: 7 }, (_, day) => valueOf(row.getCell(day + 2)))
    .some(value => typeof value === 'number' && Number.isFinite(value));
  if (!hasDailyValues) continue;
  if (!store) throw new Error(`Tienda de tráfico sin homologar: ${valueOf(row.getCell(1))}`);
  for (let day = 0; day < 7; day++) {
    const date = new Date(Date.UTC(2026, 2, 2 + week * 7 + day)).toISOString().slice(0, 10);
    if (date <= trafficCutoff) continue;
    const raw = valueOf(row.getCell(day + 2));
    if (typeof raw === 'number' && (!Number.isSafeInteger(raw) || raw < 0)) throw new Error(`Conteo inválido: ${date}, ${store}`);
    const quantity = typeof raw === 'number' ? raw : null;
    const entryKey = `${date}|${key(store)}`;
    if (newTraffic.has(entryKey)) throw new Error(`Día duplicado: ${entryKey}`);
    newTraffic.set(entryKey, { date, store, quantity });
    if (date > sourceTrafficCutoff && quantity != null) sourceTrafficCutoff = date;
  }
}
for (const [entryKey, row] of newTraffic) {
  if (row.date > sourceTrafficCutoff) newTraffic.delete(entryKey);
}
for (const date of new Set([...newTraffic.values()].map(row => row.date))) {
  for (const store of storeNames.values()) {
    const entryKey = `${date}|${key(store)}`;
    if (!newTraffic.has(entryKey) && !existingTraffic.has(entryKey)) newTraffic.set(entryKey, { date, store, quantity: null });
  }
}

const monthNames = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const newLosses = [];
for (let index = 3; index <= sourceIncidents.rowCount; index++) {
  const row = sourceIncidents.getRow(index);
  const date = dateOf(valueOf(row.getCell(3)));
  if (!date || date <= lossCutoff || normalize(valueOf(row.getCell(11))) !== 'ROBO') continue;
  const store = storeNames.get(key(valueOf(row.getCell(2))));
  if (!store) throw new Error(`Tienda de robo sin homologar: ${valueOf(row.getCell(2))}`);
  const quantity = Number(valueOf(row.getCell(8)));
  const total = Number(valueOf(row.getCell(10)));
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(total) || total < 0) throw new Error(`Robo inválido en fila ${index}`);
  const month = Number(date.slice(5, 7));
  newLosses.push({ date, store, month, quantity, total, area: String(valueOf(row.getCell(5)) ?? 'OTROS').trim(),
    product: String(valueOf(row.getCell(6)) ?? 'SIN DESCRIPCIÓN').trim(), sourceRow: index });
}
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', previousTrafficCutoff: trafficCutoff,
  sourceTrafficCutoff, newTrafficDays: new Set([...newTraffic.values()].map(row => row.date)).size,
  newTrafficRows: newTraffic.size, previousLossCutoff: lossCutoff,
  sourceLossCutoff: newLosses.map(row => row.date).sort().at(-1) || lossCutoff,
  newRobberies: newLosses.length, robberyValue: newLosses.reduce((total, row) => total + row.total, 0) }, null, 2));
if (!apply) process.exit(0);

for (const row of [...newTraffic.values()].sort((a, b) => a.date.localeCompare(b.date) || a.store.localeCompare(b.store))) {
  trafficSheet.addRow([new Date(`${row.date}T00:00:00Z`), row.store, row.quantity,
    row.quantity == null ? 'SIN INFORMACIÓN' : 'REGISTRADO']);
}
for (const row of newLosses) {
  lossSheet.addRow([new Date(`${row.date.slice(0, 7)}-01T00:00:00Z`), new Date(`${row.date}T00:00:00Z`),
    Number(row.date.slice(0, 4)), row.month, monthNames[row.month - 1], row.store, row.area, 'ROBO',
    `Excel seguridad 2026, fila ${row.sourceRow}`, null, row.product, row.quantity,
    row.total / row.quantity, row.total]);
}
trafficSheet.getColumn(1).numFmt = 'yyyy-mm-dd';
lossSheet.getColumn(1).numFmt = 'yyyy-mm-dd';
lossSheet.getColumn(2).numFmt = 'yyyy-mm-dd';
const backupDir = path.join(root, '.etl_work', 'security-layer1-backups');
await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
for (const [file, workbook] of [[trafficPath, traffic], [lossPath, loss]]) {
  const backup = path.join(backupDir, `${path.basename(file, '.xlsx')}-before-${stamp}.xlsx`);
  const temporary = path.join(backupDir, `${path.basename(file, '.xlsx')}-next-${stamp}.xlsx`);
  await workbook.xlsx.writeFile(temporary);
  const check = new ExcelJS.Workbook();
  await check.xlsx.readFile(temporary);
  if (!check.worksheets.length) throw new Error(`Falló la verificación de ${file}`);
  await copyFile(file, backup);
  await copyFile(temporary, file);
  console.log(JSON.stringify({ updated: file, backup }));
}
