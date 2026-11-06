import { stockTransfers } from '../../shared/stock-transfers.js';

export function storeTransferOpportunities(compact, storeIds, predictive) {
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
  const sales90 = new Map();
  if (predictive?.encoding === 'predictive-v1') {
    for (const values of predictive.rows) {
      let position = 3;
      const units60 = values[2] & 1 ? values[position++] : 0;
      const units90 = values[2] & 2 ? values[position] : units60;
      sales90.set(JSON.stringify([predictive.dictionary.storeId[values[0]], predictive.dictionary.productId[values[1]]]), units90);
    }
  } else if (Array.isArray(predictive)) {
    for (const row of predictive) sales90.set(JSON.stringify([row.storeId, row.productId]), row.units90);
  } else {
    throw new Error('No están disponibles las ventas de 90 días para calcular traslados.');
  }
  for (const row of products) row.units90 = sales90.get(JSON.stringify([row.storeId, row.productId])) ?? 0;
  const allowed = new Set(storeIds);
  const routes = stockTransfers(products, 60, 90, false)
    .filter(row => allowed.has(row.source));
  const positions = new Set(routes.flatMap(row => [JSON.stringify([row.productId, row.source]), JSON.stringify([row.productId, row.destination])]));
  return { routes, products: products.filter(row => positions.has(JSON.stringify([row.productId, row.storeId]))) };
}
