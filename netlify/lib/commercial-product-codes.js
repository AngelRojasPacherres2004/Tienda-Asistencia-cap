import { createHash } from 'node:crypto';
import { readRows } from './read-rows.js';

export function catalogProductId(code) {
  const normalized = String(code).trim().replace(/\s+/g, ' ').toUpperCase().replace(/\.0+$/, '');
  return `P_${createHash('sha256').update(normalized).digest('hex').slice(0, 16).toUpperCase()}`;
}

export function createProductCodeLookup(db) {
  let cached;
  let expires = 0;
  return async function productCodes(productIds) {
    if (!Array.isArray(productIds) || productIds.length > 5000 ||
        productIds.some(id => typeof id !== 'string' || !/^P_[A-F0-9]{16}$/.test(id))) {
      const error = new Error('La lista de productos no es válida.');
      error.status = 400;
      throw error;
    }
    if (!productIds.length) return {};
    if (!cached || Date.now() >= expires) {
      expires = Date.now() + 15 * 60 * 1000;
      cached = readRows(db.from('productos').select('codigo_nissei').eq('rubro', 'CALZADO').order('codigo_nissei'))
        .then(rows => new Map(rows.filter(row => row.codigo_nissei).map(row => [catalogProductId(row.codigo_nissei), row.codigo_nissei])))
        .catch(error => { cached = undefined; throw error; });
    }
    const index = await cached;
    return Object.fromEntries([...new Set(productIds)].filter(id => index.has(id)).map(id => [id, index.get(id)]));
  };
}
