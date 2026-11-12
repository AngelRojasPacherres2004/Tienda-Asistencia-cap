export const COMMERCIAL_BATCH_SOURCES = Object.freeze([
  { id: "ventas", label: "Ventas", fileName: "Ventas.parquet" },
  { id: "ingresos", label: "Ingresos", fileName: "Ingresos.parquet" },
  { id: "transferencias", label: "Transferencias", fileName: "Transferencias.parquet" },
  { id: "stock", label: "Stock", fileName: "Stock.parquet", closingOnly: true },
]);

export const COMMERCIAL_BATCH_CORE_SOURCES = Object.freeze(
  COMMERCIAL_BATCH_SOURCES.filter(item => !item.closingOnly),
);
export const COMMERCIAL_BATCH_MAX_BYTES = 300 * 1024 * 1024;

export function validateCutoff(value) {
  if (typeof value !== "string" || !/^20\d\d-\d\d-\d\d$/.test(value)) throw new Error("Selecciona una fecha de corte válida.");
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Selecciona una fecha de corte válida.");
  if (value > new Date().toISOString().slice(0, 10)) throw new Error("La fecha de corte no puede estar en el futuro.");
  return value;
}

export function isMonthEnd(cutoff) {
  validateCutoff(cutoff);
  const [year, month] = cutoff.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate() === Number(cutoff.slice(-2));
}

export function validateCommercialBatchFile(source, fileName, cutoff) {
  validateCutoff(cutoff);
  const definition = COMMERCIAL_BATCH_SOURCES.find(item => item.id === source);
  if (!definition) throw new Error("Fuente RMS no válida.");
  if (typeof fileName !== "string" || fileName !== definition.fileName) throw new Error(`${definition.label} debe llamarse exactamente ${definition.fileName}.`);
  if (definition.closingOnly && !isMonthEnd(cutoff)) throw new Error("Stock solo se admite para el cierre del último día del mes.");
  return definition;
}

export function validateBatchId(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) throw new Error("El lote no es válido.");
  return value;
}

export function validateBatchChecksum(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error("El checksum del archivo Parquet no es válido.");
  }
  return value;
}

export function commercialBatchPath(batchId) {
  return `commercial-intake/${validateBatchId(batchId)}.json`;
}

// Ruta determinística usada como cerrojo atómico: Storage rechaza dos cargas
// sin upsert al mismo objeto, incluso si llegan desde pestañas simultáneas.
export function commercialBatchCutoffPath(cutoff) {
  return `commercial-intake-locks/${validateCutoff(cutoff)}.json`;
}

export function commercialBatchSources(receipts, cutoff) {
  validateCutoff(cutoff);
  if (!Array.isArray(receipts)) throw new Error("Adjunta un lote RMS válido.");
  const sourceIds = receipts.map(item => item.source);
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error("No se puede repetir una fuente en el mismo lote.");
  const validIds = new Set(COMMERCIAL_BATCH_SOURCES.map(item => item.id));
  if (sourceIds.some(id => !validIds.has(id))) throw new Error("El lote contiene fuentes no reconocidas.");
  const missingCore = COMMERCIAL_BATCH_CORE_SOURCES.filter(item => !sourceIds.includes(item.id));
  if (missingCore.length) throw new Error(`Faltan archivos requeridos: ${missingCore.map(item => item.label).join(", ")}.`);
  const closing = isMonthEnd(cutoff);
  const hasStock = sourceIds.includes("stock");
  if (closing && !hasStock) throw new Error("El cierre mensual requiere Stock.parquet.");
  if (!closing && hasStock) throw new Error("Stock.parquet solo se permite el último día del mes.");
  if (sourceIds.length !== (closing ? 4 : 3)) throw new Error("El lote no coincide con la fecha de corte.");
  receipts.forEach(item => validateCommercialBatchFile(item.source, item.fileName, cutoff));
  return sourceIds;
}
