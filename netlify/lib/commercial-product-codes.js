import { createHash } from 'node:crypto';

export const MAX_PRODUCT_CODE_IDS = 20_000;
export const PRODUCT_CODE_QUERY_BATCH = 250;

async function readLegacyCatalogCodes(db) {
  const pageSize = 1000;
  const page = async index => {
    const { data, error } = await db.from('productos').select('codigo_nissei')
      .order('codigo_nissei').range(index * pageSize, (index + 1) * pageSize - 1);
    if (error) throw error;
    return data || [];
  };
  const rows = await page(0);
  if (rows.length < pageSize) return rows;
  let nextPage = 1, finished = false;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (!finished) {
      const index = nextPage++;
      const batch = await page(index);
      rows.push(...batch);
      if (batch.length < pageSize) finished = true;
    }
  }));
  return rows;
}

const missingPortalView = error => ['42P01', 'PGRST205'].includes(error?.code);

export function catalogProductId(code) {
  const normalized = String(code).trim().replace(/\s+/g, ' ').toUpperCase().replace(/\.0+$/, '');
  return `P_${createHash('sha256').update(normalized).digest('hex').slice(0, 16).toUpperCase()}`;
}

export function createProductCodeLookup(db) {
  let legacyCache;
  let legacyExpires = 0;
  let viewUnavailableUntil = 0;
  async function legacyLookup(ids) {
    if (!legacyCache || Date.now() >= legacyExpires) {
      legacyExpires = Date.now() + 15 * 60 * 1000;
      legacyCache = readLegacyCatalogCodes(db)
        .then(rows => new Map(rows.filter(row => row.codigo_nissei)
          .map(row => [catalogProductId(row.codigo_nissei), row.codigo_nissei])))
        .catch(error => { legacyCache = undefined; throw error; });
    }
    const index = await legacyCache;
    return Object.fromEntries(ids.filter(id => index.has(id)).map(id => [id, index.get(id)]));
  }
  return async function productCodes(productIds) {
    if (!Array.isArray(productIds) || productIds.length > MAX_PRODUCT_CODE_IDS ||
        productIds.some(id => typeof id !== 'string' || !/^P_[A-F0-9]{16}$/.test(id))) {
      const error = new Error('La lista de productos no es válida.');
      error.status = 400;
      throw error;
    }
    if (!productIds.length) return {};
    const uniqueIds = [...new Set(productIds)];
    if (Date.now() < viewUnavailableUntil) return legacyLookup(uniqueIds);
    const batches = [];
    for (let offset = 0; offset < uniqueIds.length; offset += PRODUCT_CODE_QUERY_BATCH) {
      batches.push(uniqueIds.slice(offset, offset + PRODUCT_CODE_QUERY_BATCH));
    }
    const rows = [];
    let nextBatch = 0;
    await Promise.all(Array.from({ length: Math.min(4, batches.length) }, async () => {
      while (nextBatch < batches.length) {
        const batch = batches[nextBatch++];
        const { data, error } = await db.from('productos_codigos_portal')
          .select('codigo_portal_id,codigo_nissei')
          .in('codigo_portal_id', batch);
        if (error) throw error;
        rows.push(...(data || []));
      }
    })).catch(error => {
      if (!missingPortalView(error)) throw error;
      viewUnavailableUntil = Date.now() + 60_000;
      return null;
    });
    if (Date.now() < viewUnavailableUntil) return legacyLookup(uniqueIds);
    return Object.fromEntries(rows
      .filter(row => row.codigo_portal_id && row.codigo_nissei)
      .map(row => [row.codigo_portal_id, row.codigo_nissei]));
  };
}
