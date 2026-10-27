export type TransferProduct = {
  productId: string; productCode?: string; product: string; storeId: string; category: string; line: string; brand?: string;
  stockUnits: number; goodUnits?: number; units30: number;
};
/** With allocate=false, routes are independent alternatives, never an additive dispatch plan. */
export function stockTransfers(rows: TransferProduct[], healthyDays = 30, excessDays = 90, allocate = true) {
  const products = new Map<string, Map<string, TransferProduct>>();
  for (const row of rows) {
    if (!row.productId.trim()) continue;
    const stores = products.get(row.productId) || new Map<string, TransferProduct>();
    const previous = stores.get(row.storeId);
    stores.set(row.storeId, previous ? {
      ...previous, stockUnits: previous.stockUnits + row.stockUnits, units30: previous.units30 + row.units30,
      goodUnits: previous.goodUnits !== undefined && row.goodUnits !== undefined ? previous.goodUnits + row.goodUnits : undefined
    } : { ...row });
    products.set(row.productId, stores);
  }
  const result: Array<{
    productId: string; productCode?: string; product: string; category: string; line: string; brand: string;
    source: string; destination: string; sourceStock: number; destinationStock: number;
    sourceSales: number; destinationSales: number; sourceDays: number | null; destinationDays: number;
    suggested: number; critical: boolean; estimated: boolean;
  }> = [];
  for (const [productId, stores] of products) {
    const positions = [...stores.values()].map(row => {
      const stock = Math.max(0, row.goodUnits ?? row.stockUnits * .82);
      const sales = Math.max(0, row.units30), daily = sales / 30;
      return { row, stock, sales, daily, days: daily > 0 ? stock / daily : null,
        available: Math.max(0, Math.floor(stock - daily * healthyDays)),
        need: Math.max(0, Math.ceil(daily * healthyDays - stock)) };
    });
    const donors = positions.filter(p => p.available > 0 && (p.sales === 0 || (p.days !== null && p.days > excessDays)))
      .sort((a, b) => b.available - a.available || a.row.storeId.localeCompare(b.row.storeId));
    const receivers = positions.filter(p => p.sales > 0 && p.days !== null && p.days < healthyDays && p.need > 0)
      .sort((a, b) => a.days! - b.days! || b.sales - a.sales || a.row.storeId.localeCompare(b.row.storeId));
    for (const receiver of receivers) {
      for (const donor of donors) {
        if (donor.row.storeId === receiver.row.storeId || donor.available <= 0 || receiver.need <= 0) continue;
        const suggested = Math.min(donor.available, receiver.need);
        if (allocate) { donor.available -= suggested; receiver.need -= suggested; }
        result.push({ productId, productCode: donor.row.productCode || receiver.row.productCode,
          product: donor.row.product, category: donor.row.category, line: donor.row.line, brand: donor.row.brand || '',
          source: donor.row.storeId, destination: receiver.row.storeId, sourceStock: donor.stock, destinationStock: receiver.stock,
          sourceSales: donor.sales, destinationSales: receiver.sales, sourceDays: donor.days, destinationDays: receiver.days!,
          suggested, critical: receiver.days! <= healthyDays / 2,
          estimated: donor.row.goodUnits === undefined || receiver.row.goodUnits === undefined });
      }
    }
  }
  return result.sort((a, b) => Number(b.critical) - Number(a.critical) || a.destinationDays - b.destinationDays || b.suggested - a.suggested || a.productId.localeCompare(b.productId));
}

/** Totals for the filtered opportunities, counting each product/store only once. */
export function transferTotals(products: readonly TransferProduct[], opportunities: readonly {
  productId: string; source: string; destination: string;
}[], storeId = '') {
  const storesByProduct = new Map<string, Set<string>>();
  for (const row of opportunities) {
    const stores = storesByProduct.get(row.productId) || new Set<string>();
    stores.add(row.source); stores.add(row.destination);
    storesByProduct.set(row.productId, stores);
  }
  let stockUnits = 0, salesUnits = 0;
  for (const row of products) {
    if (storeId && row.storeId !== storeId) continue;
    if (!storesByProduct.get(row.productId)?.has(row.storeId)) continue;
    stockUnits += row.stockUnits;
    salesUnits += row.units30;
  }
  return { stockUnits, salesUnits };
}
