export const COMMERCIAL_BATCH_SOURCES = Object.freeze([
  { id: "ventas", label: "Ventas", required: true },
  { id: "stock", label: "Stock", required: true },
  { id: "ingresos", label: "Ingreso", required: true },
  { id: "transferencias", label: "Transferencia", required: true },
]);

export const COMMERCIAL_BATCH_REQUIRED_SOURCES = COMMERCIAL_BATCH_SOURCES.filter(item => item.required);
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
    throw new Error("Adjunta los cuatro archivos Parquet: Ventas, Transferencias, Ingresos y Stock.");
  }
  const sourceIds = receipts.map(item => item.source);
  const uniqueIds = new Set(sourceIds);
  if (uniqueIds.size !== sourceIds.length) {
    throw new Error("No se puede repetir una fuente en el mismo lote.");
  }
  // Verificar que todos los requeridos estén presentes
  const missingRequired = COMMERCIAL_BATCH_REQUIRED_SOURCES.filter(item => !sourceIds.includes(item.id));
  if (missingRequired.length > 0) {
    throw new Error(`Faltan archivos requeridos: ${missingRequired.map(item => item.label).join(", ")}.`);
  }
  // Verificar que solo fuentes válidas estén presentes
  const validIds = new Set(COMMERCIAL_BATCH_SOURCES.map(item => item.id));
  if (sourceIds.some(id => !validIds.has(id))) {
    throw new Error("El lote contiene fuentes no reconocidas.");
  }
  return sourceIds;
}
