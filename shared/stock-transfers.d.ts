export type TransferProduct = {
    productId: string;
    productCode?: string;
    product: string;
    storeId: string;
    category: string;
    line: string;
    brand?: string;
    stockUnits: number;
    goodUnits?: number;
    units30: number;
};
/** With allocate=false, routes are independent alternatives, never an additive dispatch plan. */
export declare function stockTransfers(rows: TransferProduct[], healthyDays?: number, excessDays?: number, allocate?: boolean): {
    productId: string;
    productCode?: string;
    product: string;
    category: string;
    line: string;
    brand: string;
    source: string;
    destination: string;
    sourceStock: number;
    destinationStock: number;
    sourceSales: number;
    destinationSales: number;
    sourceDays: number | null;
    destinationDays: number;
    suggested: number;
    critical: boolean;
    estimated: boolean;
}[];
/** Totals for the filtered opportunities, counting each product/store only once. */
export declare function transferTotals(products: readonly TransferProduct[], opportunities: readonly {
    productId: string;
    source: string;
    destination: string;
}[], storeId?: string): {
    stockUnits: number;
    salesUnits: number;
};
