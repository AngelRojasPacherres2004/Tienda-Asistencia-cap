export const NORMALIZED_REPORTS = Object.freeze([
  { id: "ventas", label: "Ventas", grain: "Mes · tienda · clasificación y marca" },
  { id: "stock", label: "Stock", grain: "Corte · tienda · clasificación y marca" },
  { id: "ingresos", label: "Ingreso", grain: "Mes · tienda · clasificación y marca" },
  { id: "transferencias", label: "Transferencia", grain: "Movimiento · origen · destino" },
]);

export function normalizedReportPath(version, kind, storeId) {
  if (!/^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/.test(version)
    || !NORMALIZED_REPORTS.some(item => item.id === kind)
    || !/^T\d{3}$/.test(storeId)) throw new Error("Reporte comercial no válido.");
  return `commercial-reports/${version}/${kind}/${storeId}.csv`;
}
