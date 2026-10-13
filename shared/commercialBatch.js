export const COMMERCIAL_BATCH_SOURCES = Object.freeze([
  { id: "ventas", label: "Ventas" },
  { id: "stock", label: "Stock" },
  { id: "ingresos", label: "Ingreso" },
  { id: "transferencias", label: "Transferencia" },
]);
export const COMMERCIAL_BATCH_MAX_BYTES = 300 * 1024 * 1024;

export function validateCutoff(value) {
  if (typeof value !== "string" || !/^20\d\d-\d\d-\d\d$/.test(value)) {
    throw new Error("Selecciona una fecha de corte válida.");
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Selecciona una fecha de corte válida.");
  }
  return value;
}

export function validateBatchId(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) {
    throw new Error("El lote no es válido.");
  }
  return value;
}

export function commercialBatchPath(batchId) {
  return `commercial-intake/${validateBatchId(batchId)}.json`;
}

export function commercialBatchSources(receipts) {
  if (!Array.isArray(receipts) || receipts.length !== COMMERCIAL_BATCH_SOURCES.length) {
    throw new Error("Adjunta los cuatro archivos del lote.");
  }
  const sourceIds = receipts.map(item => item.source);
  if (new Set(sourceIds).size !== COMMERCIAL_BATCH_SOURCES.length
    || COMMERCIAL_BATCH_SOURCES.some(item => !sourceIds.includes(item.id))) {
    throw new Error("El lote debe incluir Ventas, Stock, Ingreso y Transferencia una sola vez.");
  }
  return sourceIds;
}
