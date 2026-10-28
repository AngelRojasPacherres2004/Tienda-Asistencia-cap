type StockInput = {
  storeId: string; stockUnits: number; stockValue: number; units30: number; sales30: number;
  goodUnits?: number; mermaStockUnits?: number; desmedroStockUnits?: number;
};

/** Keeps the original input order for every sum, shared by coverage and rotation. */
export function aggregateStoreMetrics(rows: readonly StockInput[]) {
  const stores = new Map<string, {
    count: number; stockUnits: number; stockValue: number; units30: number; sales30: number;
    goodUnits: number; hasStateBreakdown: boolean;
  }>();
  for (const row of rows) {
    let total = stores.get(row.storeId);
    if (!total) {
      total = { count: 0, stockUnits: 0, stockValue: 0, units30: 0, sales30: 0, goodUnits: 0, hasStateBreakdown: false };
      stores.set(row.storeId, total);
    }
    total.count++;
    total.stockUnits += Number(row.stockUnits) || 0;
    total.stockValue += Number(row.stockValue) || 0;
    total.units30 += Number(row.units30) || 0;
    total.sales30 += Number(row.sales30) || 0;
    total.goodUnits += row.goodUnits || 0;
    total.hasStateBreakdown ||= row.goodUnits != null || row.mermaStockUnits != null || row.desmedroStockUnits != null;
  }
  return stores;
}

export function stockExtremes(rows: readonly { productId: string; product: string; stockUnits: number; stockValue: number }[]) {
  const totals = new Map<string, { name: string; units: number; value: number }>();
  for (const row of rows) {
    const key = `${row.productId}|${row.product}`;
    let total = totals.get(key);
    if (!total) { total = { name: key.slice(key.indexOf('|') + 1), units: 0, value: 0 }; totals.set(key, total); }
    total.units += Number(row.stockUnits) || 0;
    total.value += Number(row.stockValue) || 0;
  }
  const high: Array<{ name: string; units: number; value: number }> = [];
  const low: typeof high = [];
  for (const row of totals.values()) {
    if (!(row.units > 0)) continue;
    // Stable ties match both stable sorts in the original implementation.
    const highIndex = high.findIndex(item => item.units < row.units);
    high.splice(highIndex < 0 ? high.length : highIndex, 0, row);
    if (high.length > 3) high.pop();
    const lowIndex = low.findIndex(item => item.units > row.units);
    low.splice(lowIndex < 0 ? low.length : lowIndex, 0, row);
    if (low.length > 3) low.pop();
  }
  return { high, low };
}

export function aggregateSellerRanking(rows: readonly { seller?: string; net: number; units: number; transactions: number }[]) {
  const totals = new Map<string, { seller: string; net: number; units: number; transactions: number }>();
  for (const row of rows) {
    const seller = row.seller || 'SIN VENDEDOR';
    let total = totals.get(seller);
    if (!total) { total = { seller, net: 0, units: 0, transactions: 0 }; totals.set(seller, total); }
    total.net += Number(row.net) || 0;
    total.units += Number(row.units) || 0;
    total.transactions += Number(row.transactions) || 0;
  }
  return [...totals.values()].filter(row => row.net !== 0).sort((a, b) => b.net - a.net);
}

export const dashboardMoneyFormat = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 });
export const dashboardNumberFormat = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 });
export const dashboardPercentFormat = new Intl.NumberFormat('es-PE', { style: 'percent', maximumFractionDigits: 2 });
