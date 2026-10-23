import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readMigration = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8').toLowerCase();

test('la clave comercial se calcula en una vista y no se duplica como columna almacenada', () => {
  const sql = readMigration('20261023162555_optimize_product_codes_and_credentials.sql');
  assert.match(sql, /create unique index if not exists productos_codigo_portal_id_ux[\s\S]*codigo_portal_producto\(codigo_nissei\)/);
  assert.match(sql, /create or replace view public\.productos_codigos_portal[\s\S]*security_invoker = true/);
  assert.doesNotMatch(sql, /add column if not exists codigo_portal_id/);
});

test('los índices de talla excluyen los códigos históricos que no tienen sufijo canónico', () => {
  const sql = readMigration('20261023100000_catalogo_tallas_nissei.sql');
  assert.match(sql, /productos_codigo_base_idx[\s\S]*where codigo_base is not null/);
  assert.match(sql, /productos_codigo_talla_idx[\s\S]*where codigo_talla is not null/);
});

test('la optimización de tráfico conserva los índices útiles y ajusta autovacuum', () => {
  const sql = readMigration('20261023164227_optimize_operational_schema.sql');
  assert.match(sql, /drop index if exists public\.trafico_tienda_fecha_idx/);
  assert.match(sql, /drop index if exists public\.idx_trafico_tienda_tienda/);
  assert.match(sql, /autovacuum_vacuum_scale_factor = 0\.05/);
  assert.doesNotMatch(sql, /drop index[^;]+idx_trafico_tienda_fecha/);
});
