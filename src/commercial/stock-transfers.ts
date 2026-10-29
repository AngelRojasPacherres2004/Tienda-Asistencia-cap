export { stockTransfers, transferTotals } from '../../shared/stock-transfers.js';
export type { TransferProduct } from '../../shared/stock-transfers.js';
export type StockTransferRoute = ReturnType<typeof import('../../shared/stock-transfers.js').stockTransfers>[number];
