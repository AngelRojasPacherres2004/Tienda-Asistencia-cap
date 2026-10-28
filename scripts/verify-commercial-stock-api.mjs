// Read-only end-to-end check of portal scope, published cutoff and RPC payload.
import { loadEnv } from 'vite';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'node:fs';

Object.assign(process.env, loadEnv('development', process.cwd(), ''));
if (!process.env.SUPABASE_URL?.includes('xtnihjzqnxozbotymoma.supabase.co')) {
  throw new Error('La API local no apunta a bd-app.');
}
const { handler } = await import('../netlify/functions/api.js');
const response = await fetch(
  `${process.env.SUPABASE_URL}/rest/v1/usuarios?select=id,rol,tienda_id,estado,cambio_credenciales_pendiente&rol=eq.gerente_comercial&estado=eq.activo&limit=10`,
  { headers: { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` } },
);
if (!response.ok) throw new Error(`No se pudo leer el usuario comercial: HTTP ${response.status}`);
const people = await response.json();
const user = people.find(row => !row.cambio_credenciales_pendiente);
if (!user) throw new Error('No hay usuario comercial activo para la prueba.');
const cookie = `asiste_session=${jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '5m' })}`;
const call = async (path, method = 'GET', body = null) => {
  const result = await handler({ httpMethod: method, path: `/api${path}`,
    headers: { cookie, 'content-type': 'application/json' }, queryStringParameters: {},
    body: body ? JSON.stringify(body) : null });
  return { status: result.statusCode, body: JSON.parse(result.body), bytes: Buffer.byteLength(result.body, 'utf8') };
};
const access = await call('/commercial/access');
if (access.status !== 200) throw new Error(`Acceso comercial HTTP ${access.status}: ${access.body.error}`);
const storeIds = access.body.access.storeIds;
if (!storeIds?.length) throw new Error('El usuario comercial no tiene tiendas autorizadas.');
const started = performance.now();
const result = await call('/commercial/stock-insights', 'POST', {
  storeIds, rubros: ['TEXTIL', 'CALZADO'], lines: [], sublines: [],
  windowDays: 30, movementDays: 90, healthyDays: 30,
  overstockDays: 90, mermaPct: 2, horizonDays: 0,
});
if (result.status !== 200) throw new Error(`Stock insights HTTP ${result.status}: ${result.body.error}`);
if (result.bytes >= 5_000_000) throw new Error(`Respuesta demasiado grande: ${result.bytes}`);
if (!result.body.rowCount || !Array.isArray(result.body.healthRows)) throw new Error('La respuesta predictiva está incompleta.');
console.log(`API comercial: ${result.body.rowCount} filas agregadas, ${result.bytes} bytes, ${storeIds.length} tiendas autorizadas, ${((performance.now() - started) / 1000).toFixed(2)} s.`);

const source = JSON.parse(readFileSync(new URL('../commercial-dashboard/public/assets/data/dashboard-stock-products.json', import.meta.url), 'utf8')).stockProducts;
const complete = source.filter(row => storeIds.includes(row.storeId) && ['TEXTIL', 'CALZADO'].includes(row.category));
const allBrands = field => result.body.brandRows.reduce((value, row) => value + row[field], 0);
const allSource = field => complete.reduce((value, row) => value + row[field], 0);
if (result.body.rowCount !== complete.length
    || Math.abs(allBrands('stockUnits') - allSource('stockUnits')) > .001
    || Math.abs(allBrands('stockValue') - allSource('stockValue')) > .001) {
  throw new Error('El agregado total no coincide con los datos de origen.');
}
const candidates = source.filter(row => storeIds.includes(row.storeId) && row.category === 'CALZADO');
const sample = candidates[0];
if (!sample) throw new Error('No hay calzado de prueba en las tiendas autorizadas.');
const selected = candidates.filter(row => row.storeId === sample.storeId && row.line === sample.line && row.subline === sample.subline);
const filtered = await call('/commercial/stock-insights', 'POST', {
  storeIds: [sample.storeId], rubros: ['CALZADO'], lines: [sample.line], sublines: [sample.subline],
  windowDays: 60, movementDays: 60, healthyDays: 45, overstockDays: 120, mermaPct: 5, horizonDays: 30,
});
if (filtered.status !== 200) throw new Error(`Filtro de jerarquía HTTP ${filtered.status}: ${filtered.body.error}`);
const total = field => filtered.body.brandRows.reduce((value, row) => value + row[field], 0);
const expected = field => selected.reduce((value, row) => value + row[field], 0);
if (filtered.body.rowCount !== selected.length
    || Math.abs(total('stockUnits') - expected('stockUnits')) > .001
    || Math.abs(total('stockValue') - expected('stockValue')) > .001) {
  throw new Error('El filtro tienda/rubro/línea/sublínea no coincide con el JSON fuente.');
}
console.log(`Filtro de jerarquía: ${selected.length} filas; ${filtered.bytes} bytes; paridad de unidades e importe OK.`);
