import { businessDate } from "../../shared/metrics.js";
export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: options.body && typeof options.body !== "string"
      ? JSON.stringify(options.body)
      : options.body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
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
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
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
