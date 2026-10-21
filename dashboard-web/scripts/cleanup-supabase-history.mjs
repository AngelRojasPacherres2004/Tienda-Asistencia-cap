import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = resolve(import.meta.dirname, '..', '..');
const apply = process.argv.includes('--apply');
const values = {};
for (const rawLine of readFileSync(resolve(root, '.env.supabase.local'), 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const split = line.indexOf('=');
  values[line.slice(0, split).trim()] = line.slice(split + 1).trim().replace(/^['"]|['"]$/g, '');
}

const url = values.SUPABASE_URL;
const secret = values.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');

const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: releases, error: releaseError } = await supabase
  .from('dashboard_releases')
  .select('id,version,status,published_at,total_bytes')
  .order('published_at', { ascending: false, nullsFirst: false });
if (releaseError) throw releaseError;

const current = releases.find((release) => release.status === 'published');
if (!current) throw new Error('No existe una versión publicada para conservar.');
const { data: currentFiles, error: fileError } = await supabase
  .from('dashboard_files')
  .select('parts')
  .eq('release_id', current.id);
if (fileError) throw fileError;
const retainedPaths = new Set((currentFiles ?? []).flatMap((row) => row.parts ?? []).map((part) => part.path));

async function listObjects(prefix = '') {
  const collected = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from('dashboard-data').list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.metadata) collected.push({ path, bytes: Number(entry.metadata.size) || 0 });
      else collected.push(...await listObjects(path));
    }
    if (!data || data.length < 1000) break;
    offset += data.length;
  }
  return collected;
}

const objects = await listObjects();
const removable = objects.filter((object) => !retainedPaths.has(object.path));
const removableBytes = removable.reduce((total, object) => total + object.bytes, 0);
console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  keepVersion: current.version,
  releasesBefore: releases.length,
  objectsBefore: objects.length,
  retainedObjects: retainedPaths.size,
  removableObjects: removable.length,
  removableMiB: Math.round(removableBytes / 1024 / 1024 * 10) / 10,
}, null, 2));

if (!apply) process.exit(0);
for (let index = 0; index < removable.length; index += 1000) {
  const paths = removable.slice(index, index + 1000).map((object) => object.path);
  const { error } = await supabase.storage.from('dashboard-data').remove(paths);
  if (error) throw error;
}
const oldIds = releases.filter((release) => release.id !== current.id).map((release) => release.id);
if (oldIds.length) {
  const { error } = await supabase.from('dashboard_releases').delete().in('id', oldIds);
  if (error) throw error;
}

const remaining = await listObjects();
const { count, error: countError } = await supabase
  .from('dashboard_releases')
  .select('id', { count: 'exact', head: true });
if (countError) throw countError;
console.log(JSON.stringify({
  status: 'complete',
  releasesAfter: count,
  objectsAfter: remaining.length,
  storageMiBAfter: Math.round(remaining.reduce((total, object) => total + object.bytes, 0) / 1024 / 1024 * 10) / 10,
}, null, 2));
