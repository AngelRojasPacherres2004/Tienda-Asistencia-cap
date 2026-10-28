import { ATTENDANCE_LABELS } from "../../shared/attendance.js";
import { businessDate } from "../../shared/metrics.js";
let activeStoreContext = null;
let storeContextLocked = false;
const pendingGets = new Map();
const recentGets = new Map();
let cacheGeneration = 0;
const DEFAULT_CACHE_TTL = 8000;

export function clearApiCache() {
  cacheGeneration += 1;
  pendingGets.clear();
  recentGets.clear();
}
export function setStoreContext(user) {
  const nextStoreContext = user?.rol === "jefe_tienda" ? user.tienda_id : null;
  if (String(nextStoreContext || "") !== String(activeStoreContext || "")) clearApiCache();
  activeStoreContext = nextStoreContext;
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
  const { cacheTtlMs = DEFAULT_CACHE_TTL, retry = true, ...fetchOptions } = options;
  const method = String(fetchOptions.method || "GET").toUpperCase();
  const cacheable = method === "GET" && !path.startsWith("/auth/") && !fetchOptions.signal && !fetchOptions.body;
  const key = `${activeStoreContext || ""}:${path}`;
  if (cacheable) {
    const cached = recentGets.get(key);
    if (cached && cached.expires > Date.now()) return cached.payload;
    const pending = pendingGets.get(key);
    if (pending) return pending;
  }

  const generation = cacheGeneration;
  const request = (async () => {
    const body = fetchOptions.body && typeof fetchOptions.body !== "string"
      ? JSON.stringify(fetchOptions.body)
      : fetchOptions.body;
    const requestOnce = async allowRetry => {
      let response;
      const timeoutSignal = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(30000) : undefined;
      const signal = fetchOptions.signal && timeoutSignal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([fetchOptions.signal, timeoutSignal]) : fetchOptions.signal || timeoutSignal;
      try {
        response = await fetch(`/api${path}`, {
          credentials: "include",
          ...fetchOptions,
          signal,
          headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...(activeStoreContext ? { "X-Store-Context": String(activeStoreContext) } : {}),
            ...fetchOptions.headers,
          },
          body,
        });
      } catch (error) {
        if (["TimeoutError", "AbortError"].includes(error?.name)) throw new Error("La consulta tardó demasiado. Intenta nuevamente.");
        if (allowRetry && retry && method === "GET") {
          await new Promise(resolve => setTimeout(resolve, 250));
          return requestOnce(false);
        }
        throw error;
      }
      if (allowRetry && retry && method === "GET" && [429, 502, 503, 504].includes(response.status)) {
        await response.text().catch(() => undefined);
        await new Promise(resolve => setTimeout(resolve, 250));
        return requestOnce(false);
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        checkContextError(payload);
        const error = new Error(payload.error || "No se pudo completar la operación.");
        error.status = response.status;
        throw error;
      }
      return payload;
    };
    const payload = await requestOnce(true);
    if (method !== "GET") clearApiCache();
    else if (cacheable && generation === cacheGeneration && cacheTtlMs > 0) recentGets.set(key, { payload, expires: Date.now() + cacheTtlMs });
    return payload;
  })();

  if (cacheable) {
    pendingGets.set(key, request);
    void request.then(() => pendingGets.delete(key), () => pendingGets.delete(key));
  }
  return request;
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

export const estadoAsistenciaLabels = ATTENDANCE_LABELS;

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
