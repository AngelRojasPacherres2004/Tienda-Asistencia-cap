export const SYSTEM_UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024;
export const SYSTEM_UPLOAD_MAX_BYTES = 250 * 1024 * 1024;

export const SYSTEM_SOURCES = Object.freeze([
  { id: "ventas", label: "Ventas (RMS)", extensions: [".xlsx", ".parquet"] },
  { id: "stock", label: "Stock (RMS)", extensions: [".xlsx", ".parquet"] },
  { id: "ingresos", label: "Ingresos (RMS)", extensions: [".xlsx", ".parquet"] },
  { id: "transferencias", label: "Transferencias (RMS)", extensions: [".xlsx", ".parquet"] },
  { id: "guias", label: "Guías en tránsito", extensions: [".xlsx"] },
  { id: "merma", label: "Merma", extensions: [".xlsx"] },
  { id: "metas", label: "Metas por tienda", extensions: [".xlsx"] },
  { id: "personal", label: "Personal", extensions: [".xlsx"] },
  { id: "tiendas", label: "Tiendas", extensions: [".xlsx"] },
  { id: "trafico", label: "Tráfico de clientes", extensions: [".xlsx"] },
]);

export function validateSystemUpload({ source, fileName, fileSize }) {
  const definition = SYSTEM_SOURCES.find((item) => item.id === source);
  if (!definition) throw new Error("Selecciona un tipo de archivo válido.");
  const extension = typeof fileName === "string"
    ? definition.extensions.find(value => fileName.toLowerCase().endsWith(value)) : null;
  if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 180
    || fileName.includes("/") || fileName.includes("\\")
    || [...fileName].some(character => character.charCodeAt(0) < 32)
    || !extension) {
    throw new Error(`El archivo de ${definition.label} debe ser ${definition.extensions.join(" o ")}.`);
  }
  if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > SYSTEM_UPLOAD_MAX_BYTES) {
    throw new Error("El archivo debe tener entre 1 byte y 250 MB.");
  }
  return { definition, extension, chunks: Math.ceil(fileSize / SYSTEM_UPLOAD_CHUNK_SIZE) };
}

export function systemPartPath(uploadId, index) {
  if (!/^[0-9a-f-]{36}$/.test(uploadId) || !Number.isInteger(index) || index < 0 || index > 99) {
    throw new Error("Identificador de carga no válido.");
  }
  return `intake/${uploadId}/part-${String(index).padStart(3, "0")}.bin`;
}

export function systemManifestPath(uploadId) {
  if (!/^[0-9a-f-]{36}$/.test(uploadId)) throw new Error("Identificador de carga no válido.");
  return `intake-manifests/${uploadId}.json`;
}
