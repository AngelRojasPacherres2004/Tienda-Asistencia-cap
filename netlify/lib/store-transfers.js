import { stockTransfers } from '../../shared/stock-transfers.js';

export function storeTransferOpportunities(compact, storeIds) {
  if (!Array.isArray(compact) && compact?.encoding !== 'stock-v1') throw new Error('Formato de stock no válido.');
  const metadata = ['productId', 'productCode', 'product', 'category', 'line', 'subline', 'brand'];
  const metrics = ['stockValue', 'goodUnits', 'mermaStockUnits', 'desmedroStockUnits', 'units30', 'sales30', 'units12', 'sales12'];
  const products = Array.isArray(compact) ? compact : compact.rows.map(values => {
    const row = { storeId: compact.stores[values[0]], stockUnits: values[2] };
    metadata.forEach((key, index) => { row[key] = compact.products[values[1]][index]; });
    let position = 4;
    metrics.forEach((key, index) => { row[key] = values[3] & (1 << index) ? values[position++] : index === 1 ? values[2] : 0; });
    return row;
  });
  const allowed = new Set(storeIds);
  const routes = stockTransfers(products, 30, 90, false)
    .filter(row => allowed.has(row.source) || allowed.has(row.destination));
  const positions = new Set(routes.flatMap(row => [JSON.stringify([row.productId, row.source]), JSON.stringify([row.productId, row.destination])]));
  return { routes, products: products.filter(row => positions.has(JSON.stringify([row.productId, row.storeId]))) };
}
