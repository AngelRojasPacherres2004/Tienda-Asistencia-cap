import { businessDate } from "../../shared/metrics.js";
let activeStoreContext = null;
let storeContextLocked = false;
export function setStoreContext(user) {
  activeStoreContext = user?.rol === "jefe_tienda" ? user.tienda_id : null;
  storeContextLocked = false;
}
export function lockStoreContext() { storeContextLocked = true; }
function assertStoreContextOpen() {
  if (storeContextLocked) throw new Error("La tienda está cambiando. Espera a que termine para continuar.");
}
function checkContextError(payload) {
  if (["STORE_ACCESS_REVOKED", "STORE_CONTEXT_CHANGED"].includes(payload.code)) {
    window.dispatchEvent(new CustomEvent("store-access-changed", { detail: payload.error }));
  }
}
export async function api(path, options = {}) {
  if (!path.startsWith("/auth/")) assertStoreContextOpen();
  let response;
  const timeoutSignal = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(45000) : undefined;
  const signal = options.signal && timeoutSignal && typeof AbortSignal.any === "function"
    ? AbortSignal.any([options.signal, timeoutSignal]) : options.signal || timeoutSignal;
  try { response = await fetch(`/api${path}`, {
    credentials: "include",
    ...options,
    signal,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(activeStoreContext ? { "X-Store-Context": String(activeStoreContext) } : {}),
      ...options.headers,
    },
    body: options.body && typeof options.body !== "string"
      ? JSON.stringify(options.body)
      : options.body,
  }); } catch (error) {
    if (["TimeoutError", "AbortError"].includes(error?.name)) throw new Error("La consulta tardó demasiado. Intenta nuevamente.");
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    checkContextError(payload);
    const error = new Error(payload.error || "No se pudo completar la operación.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

export const formatDate = (value, options = {}) => {
  if (!value) return "—";
  const dateOnly = String(value).length === 10;
  const date = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  }).format(date);
};

export const estadoAsistenciaLabels = {
  presente: "Asistencia", tardanza: "Tardanza", medio_turno: "Medio Turno", apoyo: "Apoyo",
  falta: "Falta", permiso: "Permiso", descanso_medico: "Descanso Médico", suspension: "Suspensión",
};

export async function downloadFile(url, fallbackName) {
  assertStoreContextOpen();
  const storeContext = activeStoreContext;
  let fileHandle = null;
  if (typeof window.showSaveFilePicker === "function") {
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: fallbackName,
        types: [{
          description: "Archivo de Microsoft Excel",
          accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
        }],
      });
    } catch (error) {
      if (error?.name === "AbortError") return false;
      throw error;
    }
  }
  assertStoreContextOpen();
  const response = await fetch(url, { credentials: "include", headers: storeContext ? { "X-Store-Context": String(storeContext) } : {} });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    checkContextError(payload);
    throw new Error(payload.error || "No se pudo generar el archivo.");
  }
  const disposition = response.headers.get("Content-Disposition") || "";
  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const basicMatch = disposition.match(/filename="([^"]+)"/i);
  const filename = encodedMatch ? decodeURIComponent(encodedMatch[1]) : basicMatch ? basicMatch[1] : fallbackName;
  const blob = await response.blob();
  if (!blob.size) throw new Error("El archivo generado está vacío.");
  if (fileHandle) {
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  }
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return true;
}

export const formatDateTime = (value) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima",
  }).format(new Date(value));
};

export const todayISO = businessDate;
