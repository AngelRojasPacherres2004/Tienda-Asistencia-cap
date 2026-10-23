const EDITABLE_GOAL_RUBROS = new Set(["TEXTIL", "CALZADO"]);

export function normalizeGoalRubro(value) {
  const rubro = String(value || "").trim().toUpperCase();
  return EDITABLE_GOAL_RUBROS.has(rubro) ? rubro : "";
}

export function aggregateCommercialGoalTotals(rows, year, userId, updatedAt = new Date().toISOString()) {
  const totals = new Map();
  for (const row of rows || []) {
    if (Number(row.anio) !== Number(year) || !EDITABLE_GOAL_RUBROS.has(String(row.rubro || "").trim().toUpperCase())) continue;
    const storeId = Number(row.tienda_id); const month = Number(row.mes); const value = Number(row.meta_venta);
    if (!Number.isInteger(storeId) || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isFinite(value)) continue;
    const key = `${storeId}|${month}`;
    totals.set(key, (totals.get(key) || 0) + value);
  }
  const totalRows = [...totals.entries()].map(([key, value]) => {
    const [storeId, month] = key.split("|").map(Number);
    return { tienda_id: storeId, anio: Number(year), mes: month, rubro: "", meta_venta: Math.round(value * 100) / 100,
      actualizado_por: userId, actualizado_en: updatedAt };
  }).sort((a, b) => a.tienda_id - b.tienda_id || a.mes - b.mes);
  return { totalRows, annualTarget: Math.round(totalRows.reduce((sum, row) => sum + row.meta_venta, 0) * 100) / 100 };
}
