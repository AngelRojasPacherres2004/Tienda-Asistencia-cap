import { createHash } from 'node:crypto';

export const MAX_PRODUCT_CODE_IDS = 20_000;

async function readCatalogCodes(db) {
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
  // Read the complete catalog without making every category wait on serial requests.
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (!finished) {
      const index = nextPage++;
      try {
        const batch = await page(index);
        rows.push(...batch);
        if (batch.length < pageSize) finished = true;
      } catch (error) {
        finished = true;
        throw error;
      }
    }
  }));
  return rows;
}

export function catalogProductId(code) {
  const normalized = String(code).trim().replace(/\s+/g, ' ').toUpperCase().replace(/\.0+$/, '');
  return `P_${createHash('sha256').update(normalized).digest('hex').slice(0, 16).toUpperCase()}`;
}

export function createProductCodeLookup(db) {
  let cached;
  let expires = 0;
  return async function productCodes(productIds) {
    if (!Array.isArray(productIds) || productIds.length > MAX_PRODUCT_CODE_IDS ||
        productIds.some(id => typeof id !== 'string' || !/^P_[A-F0-9]{16}$/.test(id))) {
      const error = new Error('La lista de productos no es válida.');
      error.status = 400;
      throw error;
    }
    if (!productIds.length) return {};
    if (!cached || Date.now() >= expires) {
      expires = Date.now() + 15 * 60 * 1000;
      cached = readCatalogCodes(db)
        .then(rows => new Map(rows.filter(row => row.codigo_nissei).map(row => [catalogProductId(row.codigo_nissei), row.codigo_nissei])))
        .catch(error => { cached = undefined; throw error; });
    }
    const index = await cached;
    return Object.fromEntries([...new Set(productIds)].filter(id => index.has(id)).map(id => [id, index.get(id)]));
  };
}
