import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = fileURLToPath(new URL('../', import.meta.url));
const python = process.env.DASHBOARD_PYTHON || resolve(root, '.venv/Scripts/python.exe');
const code = `import importlib.util,json
s=importlib.util.spec_from_file_location('stock_import','scripts/import-dashboard-stock.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
cutoff,sha,catalog,facts,totals=m.prepare()
print(json.dumps(dict(cutoff=cutoff,sha=sha,catalog=catalog,facts=facts,totals=totals)))`;
const result = spawnSync(python, ['-c', code], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true });
if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'No se pudo preparar el stock');
const data = JSON.parse(result.stdout);
console.log(`Stock ${data.cutoff}: ${data.catalog.length} productos; ${data.facts.length} filas; ${data.totals.stockUnits} unidades.`);
if (!process.argv.includes('--apply')) process.exit(0);
if (process.env.SUPABASE_URL?.replace(/\/$/, '') !== 'https://xtnihjzqnxozbotymoma.supabase.co') throw new Error('Proyecto Supabase inesperado');
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
function checked(result) { if (result.error) throw new Error(result.error.message); return result; }
const existing = checked(await c.from('dashboard_stock_snapshots').select('source_sha256,row_count,status').eq('stock_cutoff', data.cutoff).maybeSingle()).data;
if (existing && (existing.source_sha256 !== data.sha || existing.row_count !== data.facts.length)) throw new Error('El corte ya existe con otro contenido; no se reemplaza');
if (!existing) checked(await c.from('dashboard_stock_snapshots').insert({ stock_cutoff: data.cutoff, source_sha256: data.sha, row_count: data.facts.length }));
const catalogFields = ['stock_cutoff','product_id','product_code','product','category','line','subline','brand'];
const factFields = ['stock_cutoff','store_id','product_id','stock_units','stock_value','good_units','merma_stock_units','desmedro_stock_units','units30','sales30','units12','sales12','units60','units90','merma30','merma60','merma90'];
if (existing?.status !== 'ready') {
  for (const [table, rows, fields, conflict] of [
    ['dashboard_stock_catalog', data.catalog, catalogFields, 'stock_cutoff,product_id'],
    ['dashboard_stock_metrics', data.facts, factFields, 'stock_cutoff,store_id,product_id'],
  ]) {
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500).map(row => Object.fromEntries(fields.map((field, index) => [field, row[index]])));
      checked(await c.from(table).upsert(batch, { onConflict: conflict }));
      if (i % 10000 === 0) console.log(`${table}: ${Math.min(i + 500, rows.length)}/${rows.length}`);
    }
  }
}
for (const [table, count] of [['dashboard_stock_catalog', data.catalog.length], ['dashboard_stock_metrics', data.facts.length]]) {
  const actual = checked(await c.from(table).select('*', { head: true, count: 'exact' }).eq('stock_cutoff', data.cutoff)).count;
  if (actual !== count) throw new Error(`${table}: ${actual}/${count} filas`);
}
const totals = { stockUnits: 0, stockValue: 0, units30: 0 };
for (let offset = 0;; offset += 1000) {
  const rows = checked(await c.from('dashboard_stock_metrics').select('stock_units,stock_value,units30')
    .eq('stock_cutoff', data.cutoff).order('store_id').order('product_id').range(offset, offset + 999)).data;
  for (const row of rows) { totals.stockUnits += row.stock_units; totals.stockValue += row.stock_value; totals.units30 += row.units30; }
  if (rows.length < 1000) break;
}
for (const key of Object.keys(totals)) if (Math.abs(totals[key] - data.totals[key]) > Math.max(.01, Math.abs(data.totals[key]) * 1e-10)) throw new Error(`El total ${key} no coincide`);
checked(await c.from('dashboard_stock_snapshots').update({ status: 'ready', ready_at: new Date().toISOString() }).eq('stock_cutoff', data.cutoff).eq('source_sha256', data.sha));
console.log(`Stock ${data.cutoff} verificado y listo; los otros cortes se conservaron.`);
