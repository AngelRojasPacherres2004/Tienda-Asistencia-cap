import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { allocateDailySecurityTraffic, SECURITY_TRAFFIC_HOURS } from '../shared/securityTrafficAllocation.js';

const source = process.argv.find(argument => argument.toLowerCase().endsWith('.xlsx'));
const apply = process.argv.includes('--apply');
const from = process.argv.find(argument => argument.startsWith('--from='))?.slice(7);
const to = process.argv.find(argument => argument.startsWith('--to='))?.slice(5);
if (!source || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
  throw new Error('Indica un Excel y un intervalo --from=AAAA-MM-DD --to=AAAA-MM-DD.');
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error('Falta la conexión de Supabase.');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Z0-9]+/gi, ' ').trim().replace(/\s+/g, ' ').toUpperCase();
const aliases = new Map(Object.entries({
  MARINA: 'LA MARINA', 'PTE PIEDRA': 'PUENTE PIEDRA', 'ALF UGARTE': 'ALFONSO UGARTE',
  'UNION 797': 'JR DE LA UNION 797', 'PLAZA UNION': 'PLAZA UNION',
}));
const keyFor = value => aliases.get(normalize(value)) || normalize(value);
const pad = value => String(value).padStart(2, '0');
const tag = '[Excel tráfico diario]';
const imported = row => row.observaciones?.startsWith('[Excel seguridad 2026]')
  || row.observaciones?.startsWith('[Excel tráfico diario');
const { data: stores, error: storeError } = await db.from('tiendas').select('id,nombre');
if (storeError) throw storeError;
const storeByName = new Map(stores.map(store => [normalize(store.nombre), store]));
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(path.resolve(source));
const days = new Map();
const blank = [];
const unmapped = new Set();
for (const sheet of workbook.worksheets) {
  const names = sheet.getRow(1);
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const rawDate = row.getCell(1).value;
    if (!(rawDate instanceof Date)) continue;
    const date = rawDate.toISOString().slice(0, 10);
    if (date < from || date > to) continue;
    for (let column = 2; column <= sheet.columnCount; column += 1) {
      const name = names.getCell(column).value;
      if (!name) continue;
      const store = storeByName.get(keyFor(name));
      if (!store) { unmapped.add(String(name)); continue; }
      const value = row.getCell(column).value;
      if (value === null || value === undefined || value === '') {
        blank.push({ date, store: store.nombre });
        continue;
      }
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Conteo inválido: ${sheet.name}!${rowNumber}:${column}`);
      const key = `${store.id}|${date}`;
      if (days.has(key)) throw new Error(`Día duplicado: ${key}`);
      days.set(key, { storeId: store.id, store: store.nombre, date, total: value,
        source: `${sheet.name}!${rowNumber}:${column}` });
    }
  }
}
if (unmapped.size) throw new Error(`Tiendas sin homologar: ${[...unmapped].join(', ')}`);
if (!days.size) throw new Error('El intervalo no contiene conteos.');
const { data: systems, error: userError } = await db.from('usuarios').select('id').eq('usuario', 'sistemas1').limit(1);
if (userError || !systems?.length) throw new Error('No existe el usuario Sistemas1 para atribuir la importación.');
const existing = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await db.from('trafico_tienda')
    .select('id,tienda_id,fecha,hora,rango_hora,cantidad,observaciones,registrado_por')
    .gte('fecha', from).lte('fecha', to).order('id').range(offset, offset + 999);
  if (error) throw error;
  existing.push(...data);
  if (data.length < 1000) break;
}
const byDay = new Map();
for (const row of existing) {
  const key = `${row.tienda_id}|${row.fecha}`;
  if (!byDay.has(key)) byDay.set(key, []);
  byDay.get(key).push(row);
}
const missing = [], same = [], updates = [], protectedDays = [];
for (const [key, day] of days) {
  const rows = byDay.get(key) || [];
  if (!rows.length) { missing.push(day); continue; }
  const actual = rows.reduce((sum, row) => sum + Number(row.cantidad), 0);
  if (actual === day.total) { same.push(day); continue; }
  const expectedRanges = SECURITY_TRAFFIC_HOURS.map(hour => `${pad(hour)}:00-${pad(hour + 1)}:00`);
  if (rows.length === expectedRanges.length && rows.every(row =>
    imported(row)) &&
    expectedRanges.every(range => rows.some(row => row.rango_hora === range))) {
    updates.push({ ...day, actual, previous: rows });
  } else {
    protectedDays.push({ ...day, actual, rows: rows.length });
  }
}
const removedImported = [];
for (const item of blank) {
  const store = storeByName.get(normalize(item.store));
  const rows = byDay.get(`${store.id}|${item.date}`) || [];
  if (!rows.length) continue;
  if (rows.every(imported)) {
    removedImported.push({ ...item, previous: rows });
  } else {
    protectedDays.push({ ...item, reason: 'Conteo manual en una celda vacía del Excel' });
  }
}
const summary = { mode: apply ? 'apply' : 'dry-run', source: path.basename(source), from, to,
  sourceDays: days.size, sourceTotal: [...days.values()].reduce((sum, day) => sum + day.total, 0),
  same: same.length, missing: missing.length, changedImported: updates.length,
  removedImported: removedImported.map(({ date, store, previous }) => ({ date, store, rows: previous.length })),
  protected: protectedDays, blanks: blank, changedExamples: updates.slice(0, 10).map(({ store, date, actual, total }) => ({ store, date, actual, total })) };
console.log(JSON.stringify(summary, null, 2));
if (!apply) process.exit(0);
if (protectedDays.length) throw new Error('Hay días con conteos manuales distintos. No se modificó la base.');
const backupDir = path.resolve('.etl_work');
await mkdir(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `traffic-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
await writeFile(backupPath, JSON.stringify({ source: path.resolve(source), from, to,
  changedImported: updates.map(({ store, date, previous }) => ({ store, date, previous })),
  removedImported }, null, 2));
for (const item of removedImported) {
  const ids = item.previous.map(row => row.id);
  const { error } = await db.from('trafico_tienda').delete().in('id', ids);
  if (error) throw new Error(`No se pudo retirar el conteo desactualizado de ${item.store} ${item.date}: ${error.message}`);
}
const trafficRows = [...missing, ...updates].flatMap(day => {
  const values = allocateDailySecurityTraffic(day.total, day.storeId, day.date);
  if (values.reduce((sum, value) => sum + value, 0) !== day.total) throw new Error(`Distribución inválida: ${day.store} ${day.date}`);
  return SECURITY_TRAFFIC_HOURS.map((hour, index) => ({ tienda_id: day.storeId, fecha: day.date,
    hora: `${pad(hour)}:00:00`, rango_hora: `${pad(hour)}:00-${pad(hour + 1)}:00`, cantidad: values[index],
    observaciones: `${tag} total diario ${day.total}; distribución horaria estimada; ${day.source}.`,
    registrado_por: systems[0].id }));
});
for (let offset = 0; offset < trafficRows.length; offset += 300) {
  const { error } = await db.from('trafico_tienda').upsert(trafficRows.slice(offset, offset + 300),
    { onConflict: 'tienda_id,fecha,rango_hora' });
  if (error) throw new Error(`Lote ${offset}: ${error.message}`);
}
const verify = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await db.from('trafico_tienda').select('tienda_id,fecha,cantidad')
    .gte('fecha', from).lte('fecha', to).order('id').range(offset, offset + 999);
  if (error) throw error;
  verify.push(...data);
  if (data.length < 1000) break;
}
const totals = new Map();
for (const row of verify) {
  const key = `${row.tienda_id}|${row.fecha}`;
  totals.set(key, (totals.get(key) || 0) + Number(row.cantidad));
}
const mismatches = [...days].filter(([key, day]) => totals.get(key) !== day.total);
if (mismatches.length) throw new Error(`Persisten ${mismatches.length} descuadres tras la carga.`);
if (removedImported.some(item => totals.has(`${item.previous[0].tienda_id}|${item.date}`))) {
  throw new Error('Persisten conteos retirados que ya no están en el Excel.');
}
console.log(JSON.stringify({ appliedHourlyRows: trafficRows.length, verifiedDays: days.size,
  retiredHourlyRows: removedImported.reduce((sum, item) => sum + item.previous.length, 0), backupPath }));
