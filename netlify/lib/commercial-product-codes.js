import { createHash } from 'node:crypto';

export const MAX_PRODUCT_CODE_IDS = 20_000;
export const PRODUCT_CODE_QUERY_BATCH = 250;

export function catalogProductId(code) {
  const normalized = String(code).trim().replace(/\s+/g, ' ').toUpperCase().replace(/\.0+$/, '');
  return `P_${createHash('sha256').update(normalized).digest('hex').slice(0, 16).toUpperCase()}`;
}

export function createProductCodeLookup(db) {
  return async function productCodes(productIds) {
    if (!Array.isArray(productIds) || productIds.length > MAX_PRODUCT_CODE_IDS ||
        productIds.some(id => typeof id !== 'string' || !/^P_[A-F0-9]{16}$/.test(id))) {
      const error = new Error('La lista de productos no es válida.');
      error.status = 400;
      throw error;
    }
    if (!productIds.length) return {};
    const uniqueIds = [...new Set(productIds)];
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
    }));
    return Object.fromEntries(rows
      .filter(row => row.codigo_portal_id && row.codigo_nissei)
      .map(row => [row.codigo_portal_id, row.codigo_nissei]));
  };
}
