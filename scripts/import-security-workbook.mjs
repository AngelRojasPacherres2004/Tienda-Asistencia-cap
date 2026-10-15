import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { allocateDailySecurityTraffic, SECURITY_TRAFFIC_HOURS } from '../shared/securityTrafficAllocation.js';

// Dry-run by default. Use --apply only after reviewing the collision report.
const source = process.argv.find(argument => argument.toLowerCase().endsWith('.xlsx'));
const apply = process.argv.includes('--apply');
if (!source) throw new Error('Indica la ruta del Excel de seguridad.');
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error('Falta la conexión de Supabase.');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(path.resolve(source));
const trafficSheet = workbook.getWorksheet('TRÁFICO DE CLIENTES');
const incidentsSheet = workbook.getWorksheet('INCIDENCIAS');
if (!trafficSheet || !incidentsSheet) throw new Error('Faltan hojas de tráfico o incidencias.');

const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/gi, ' ').trim().replace(/\s+/g, ' ').toUpperCase();
const raw = cell => cell?.value?.result ?? cell?.value ?? null;
const clean = cell => String(raw(cell) ?? '').replace(/\s+/g, ' ').trim();
const aliases = new Map(Object.entries({
  'A UGARTE': 'ALFONSO UGARTE', 'P PIEDRA': 'PUENTE PIEDRA',
  MARINA: 'LA MARINA', 'JR UNION': 'JR DE LA UNION 797', 'JR DE LA UNION': 'JR DE LA UNION 797',
  'PLAZA UNION': 'PLAZA UNION',
}));
const storeKey = value => aliases.get(normalize(value)) || normalize(value);
const pad = number => String(number).padStart(2, '0');
const isoDate = date => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const dateFromExcel = value => {
  if (value instanceof Date) return isoDate(value);
  if (typeof value === 'number' && value > 20000) return isoDate(new Date(Date.UTC(1899, 11, 30) + value * 86400000));
  const match = String(value ?? '').match(/^(\d{4})-(\d\d)-(\d\d)/);
  return match ? match[0] : null;
};
const fetchAll = async (table, columns, configure = query => query) => {
  const results = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await configure(db.from(table).select(columns).order('id', { ascending: true }).range(offset, offset + 999));
    if (error) throw new Error(`${table}: ${error.message}`);
    results.push(...data);
    if (data.length < 1000) return results;
  }
};
const [stores, users, existingTraffic, existingIncidents, existingBrands] = await Promise.all([
  fetchAll('tiendas', 'id,nombre,codigo'),
  fetchAll('usuarios', 'id,usuario,rol', query => query.eq('usuario', 'sistemas1')),
  fetchAll('trafico_tienda', 'id,tienda_id,fecha,hora,rango_hora,cantidad,observaciones,registrado_por,updated_at', query => query.gte('fecha', '2026-03-02').lte('fecha', '2026-10-11')),
  fetchAll('incidencias', 'id,tienda_id,fecha,asunto,descripcion,tipo,area,gravedad,estado,intervencion,detencion,registrado_por,notificacion_estado'),
  fetchAll('marcas', 'id,nombre'),
]);
const storeByName = new Map(stores.map(store => [normalize(store.nombre), store]));
const importedBy = users[0]?.id;
if (!importedBy) throw new Error('No existe el usuario sistemas1 para atribuir la importación.');
const trafficDays = new Map();
const weeklyMismatches = [];
const unmappedStores = new Set();
let week = -1;
for (let rowNumber = 1; rowNumber <= trafficSheet.rowCount; rowNumber += 1) {
  const row = trafficSheet.getRow(rowNumber);
  if (normalize(raw(row.getCell(1))).startsWith('TIENDAS')) {
    week += 1;
    const monday = new Date(Date.UTC(2026, 2, 2 + week * 7));
    const day = Number(clean(row.getCell(2)).match(/\d+/)?.[0]);
    if (day !== monday.getUTCDate()) throw new Error(`Cabecera semanal inesperada en fila ${rowNumber}.`);
    continue;
  }
  if (week < 0) continue;
  const storeName = storeKey(raw(row.getCell(1)));
  const store = storeByName.get(storeName);
  const numeric = Array.from({ length: 7 }, (_, day) => ({ day, value: raw(row.getCell(day + 2)) }))
    .filter(item => typeof item.value === 'number' && Number.isFinite(item.value) && Number.isInteger(item.value) && item.value >= 0);
  if (!numeric.length) continue;
  if (!store) { unmappedStores.add(storeName); continue; }
  const dailySum = numeric.reduce((total, item) => total + item.value, 0);
  const stated = raw(row.getCell(9));
  if (typeof stated === 'number' && dailySum !== stated) weeklyMismatches.push({ row: rowNumber, store: store.nombre, dailySum, stated });
  for (const { day, value } of numeric) {
    const date = isoDate(new Date(Date.UTC(2026, 2, 2 + week * 7 + day)));
    const key = `${store.id}|${date}`;
    if (trafficDays.has(key)) throw new Error(`Día duplicado en Excel: ${key}`);
    trafficDays.set(key, { storeId: store.id, date, total: value, sourceRow: rowNumber });
  }
}
if (unmappedStores.size) throw new Error(`Tiendas sin homologar: ${[...unmappedStores].join(', ')}`);

const hours = SECURITY_TRAFFIC_HOURS;
const existingByDay = new Map();
for (const row of existingTraffic) {
  const key = `${row.tienda_id}|${row.fecha}`;
  if (!existingByDay.has(key)) existingByDay.set(key, []);
  existingByDay.get(key).push(row);
}
const collisions = [...trafficDays.entries()].filter(([key]) => existingByDay.has(key));
const conflictingDays = collisions.filter(([key, sourceDay]) => existingByDay.get(key).reduce((sum, row) => sum + row.cantidad, 0) !== sourceDay.total);
const sourceTag = '[Excel seguridad 2026]';
const incidentRows = [];
for (let rowNumber = 3; rowNumber <= incidentsSheet.rowCount; rowNumber += 1) {
  const row = incidentsSheet.getRow(rowNumber);
  const date = dateFromExcel(raw(row.getCell(3)));
  if (!date) continue;
  const store = storeByName.get(storeKey(raw(row.getCell(2))));
  if (!store) { unmappedStores.add(storeKey(raw(row.getCell(2)))); continue; }
  const sourceType = normalize(raw(row.getCell(11)));
  const type = sourceType === 'ROBO' ? 'robo' : /ROBO FRUST|ROBO FRUSTR|INTENTO ROBO/.test(sourceType) ? 'robo_frustrado' : sourceType === 'CAMBIO DE PRECIO' ? 'cambio_precio' : 'otro';
  const sourceArea = normalize(raw(row.getCell(5)));
  const area = /TEXTIL/.test(sourceArea) ? 'textil' : /CALZADO/.test(sourceArea) ? 'calzado' : /HOGAR/.test(sourceArea) ? 'hogar' : /ELECTRO/.test(sourceArea) ? 'electro' : /TECNO/.test(sourceArea) ? 'tecnologia' : /CAJA/.test(sourceArea) ? 'caja' : /ALMACEN/.test(sourceArea) ? 'almacen' : 'piso_venta';
  const product = clean(row.getCell(6));
  const brand = clean(row.getCell(7));
  const quantity = Number(raw(row.getCell(8)));
  const value = Number(raw(row.getCell(10)));
  const sourceReference = `${sourceTag} fila ${rowNumber}`;
  const details = [sourceReference, `Tipo original: ${clean(row.getCell(11))}`, product && `Producto: ${product}`, brand && `Marca: ${brand}`,
    Number.isFinite(quantity) && `Cantidad: ${quantity}`, Number.isFinite(value) && `Valor total: S/ ${value.toFixed(2)}`,
    clean(row.getCell(12)) && `Personal: ${clean(row.getCell(12))}`, clean(row.getCell(13)) && `Involucrados: ${clean(row.getCell(13))}`,
    clean(row.getCell(15)) && `Observaciones: ${clean(row.getCell(15))}`].filter(Boolean);
  incidentRows.push({ sourceRow: rowNumber, sourceReference, storeId: store.id, date, type, area, product, brand, quantity, value, details: details.join(' | ') });
}
if (unmappedStores.size) throw new Error(`Tiendas sin homologar: ${[...unmappedStores].join(', ')}`);
const alreadyImported = incidentRows.filter(item => existingIncidents.some(row => row.descripcion?.includes(item.sourceReference)));
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', source: path.basename(source), weeks: week + 1,
  dailyTotals: trafficDays.size, hourlyRows: trafficDays.size * hours.length, existingHourlyRows: existingTraffic.length,
  overlappingDays: collisions.length, daysWithDifferentTotals: conflictingDays.length,
  weeklyMismatches, incidents: incidentRows.length, alreadyImportedIncidents: alreadyImported.length }, null, 2));
if (!apply) process.exit(0);

// A copy of every pre-existing affected row is kept outside Git before the first write.
const backupDir = path.resolve('.etl_work');
await mkdir(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `security-import-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
await writeFile(backupPath, JSON.stringify({ source: path.resolve(source), traffic: collisions.flatMap(([key]) => existingByDay.get(key)), incidents: existingIncidents }, null, 2));
console.log(`Backup local: ${backupPath}`);
const trafficRows = [];
for (const item of trafficDays.values()) {
  const values = allocateDailySecurityTraffic(item.total, item.storeId, item.date);
  if (values.reduce((sum, value) => sum + value, 0) !== item.total) throw new Error(`Descuadre interno ${item.storeId} ${item.date}`);
  for (const [index, hour] of hours.entries()) trafficRows.push({ tienda_id: item.storeId, fecha: item.date,
    hora: `${pad(hour)}:00:00`, rango_hora: `${pad(hour)}:00-${pad(hour + 1)}:00`, cantidad: values[index],
    observaciones: `${sourceTag} total diario ${item.total}; distribución horaria estimada; fila ${item.sourceRow}.`, registrado_por: importedBy });
}
for (let offset = 0; offset < trafficRows.length; offset += 500) {
  const { error } = await db.from('trafico_tienda').upsert(trafficRows.slice(offset, offset + 500), { onConflict: 'tienda_id,fecha,rango_hora' });
  if (error) throw new Error(`Tráfico filas ${offset}-${offset + 499}: ${error.message}`);
  if (offset % 5000 === 0) console.log(`Tráfico: ${Math.min(offset + 500, trafficRows.length)}/${trafficRows.length}`);
}

const brandMap = new Map(existingBrands.map(row => [normalize(row.nombre), row.id]));
let insertedIncidents = 0;
for (const item of incidentRows) {
  if (existingIncidents.some(row => row.descripcion?.includes(item.sourceReference))) continue;
  const { data: incident, error } = await db.from('incidencias').insert({ tienda_id: item.storeId,
    fecha: `${item.date}T12:00:00-05:00`, asunto: item.type === 'robo' ? 'Robo' : item.type === 'robo_frustrado' ? 'Robo frustrado' : item.type === 'cambio_precio' ? 'Cambio de precio' : 'Incidencia de seguridad',
    descripcion: item.details, tipo: item.type, area: item.area, gravedad: item.type === 'robo' ? 'alta' : 'media',
    estado: 'cerrada', intervencion: item.type === 'robo_frustrado', detencion: false, registrado_por: importedBy,
    notificacion_estado: 'pendiente' }).select('id').single();
  if (error) throw new Error(`Incidencia fila ${item.sourceRow}: ${error.message}`);
  insertedIncidents += 1;
  if (item.product && Number.isInteger(item.quantity) && item.quantity > 0) {
    const brandName = item.brand || 'SIN MARCA REGISTRADA';
    const brandKey = normalize(brandName);
    let brandId = brandMap.get(brandKey);
    if (!brandId) {
      const { data: brand, error: brandError } = await db.from('marcas').insert({ nombre: brandName }).select('id').single();
      if (brandError) throw new Error(`Marca fila ${item.sourceRow}: ${brandError.message}`);
      brandId = brand.id; brandMap.set(brandKey, brandId);
    }
    const { error: productError } = await db.from('incidencia_productos').insert({ incidencia_id: incident.id, marca_id: brandId,
      producto: item.product, cantidad: item.quantity, valor: Number.isFinite(item.value) && item.value >= 0 ? item.value : 0,
      recuperado: item.type === 'robo_frustrado' });
    if (productError) throw new Error(`Producto de incidencia fila ${item.sourceRow}: ${productError.message}`);
  }
}
console.log(`Importación terminada. Tráfico: ${trafficRows.length} horas; incidencias nuevas: ${insertedIncidents}.`);
