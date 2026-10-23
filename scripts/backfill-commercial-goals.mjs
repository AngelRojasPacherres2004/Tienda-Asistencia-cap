/**
 * Recupera las metas historicas de la publicacion comercial vigente.
 * Por defecto solo audita. Requiere --apply para escribir en Supabase.
 */
import process from 'node:process';
import { gunzipSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';
import { buildCommercialGoalBackfill } from '../netlify/lib/commercial-goals-backfill.js';

const apply = process.argv.includes('--apply');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY.');

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: release, error: releaseError } = await db.from('dashboard_releases')
  .select('id,version,published_at').eq('status', 'published')
  .order('published_at', { ascending: false }).limit(1).single();
if (releaseError) throw releaseError;
const [{ data: file, error: fileError }, { data: mappings, error: mappingsError }] = await Promise.all([
  db.from('dashboard_files').select('parts').eq('release_id', release.id).eq('logical_name', 'dashboard.json').single(),
  db.from('commercial_store_map').select('dashboard_store_id,tienda_id').not('tienda_id', 'is', null),
]);
if (fileError) throw fileError;
if (mappingsError) throw mappingsError;

const chunks = [];
for (const part of file.parts || []) {
  const { data, error } = await db.storage.from('dashboard-data').download(part.path);
  if (error) throw error;
  chunks.push(Buffer.from(await data.arrayBuffer()));
}
const compressed = (file.parts || []).every(part => part.encoding === 'gzip');
const payload = JSON.parse((compressed ? gunzipSync(Buffer.concat(chunks)) : Buffer.concat(chunks)).toString('utf8'));
const plan = buildCommercialGoalBackfill({
  monthlyStore: payload.monthlyStore,
  monthlyCategoryTarget: payload.monthlyCategoryTarget,
  mappings,
});

console.log(JSON.stringify({ mode: apply ? 'apply' : 'audit', release: release.version, summary: plan.summary, missingStores: plan.missingStores }, null, 2));
if (plan.missingStores.length) throw new Error('Hay tiendas publicadas sin correspondencia interna; no se puede continuar.');
if (!apply) process.exit(0);

const schema = await db.from('metas_comerciales_tienda').select('rubro').limit(1);
if (schema.error) throw new Error('Aplica primero la migracion de metas comerciales con la columna rubro.');
for (let offset = 0; offset < plan.rows.length; offset += 500) {
  const { error } = await db.from('metas_comerciales_tienda')
    .upsert(plan.rows.slice(offset, offset + 500), { onConflict: 'tienda_id,anio,mes,rubro' });
  if (error) throw error;
}

const { count, error: verifyError } = await db.from('metas_comerciales_tienda')
  .select('id', { count: 'exact', head: true }).in('anio', [2024, 2025, 2026]);
if (verifyError) throw verifyError;
if (count < plan.rows.length) throw new Error(`La verificacion encontro ${count} filas; se esperaban al menos ${plan.rows.length}.`);
console.log(JSON.stringify({ ok: true, written: plan.rows.length, verifiedRows: count }, null, 2));
