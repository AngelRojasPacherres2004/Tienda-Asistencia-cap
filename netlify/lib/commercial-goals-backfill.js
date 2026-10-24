const EDITABLE_RUBROS = new Set(['TEXTIL', 'CALZADO']);

export function buildCommercialGoalBackfill({ monthlyStore = [], monthlyCategoryTarget = [], mappings = [] }) {
  const internalByDashboard = new Map(mappings
    .filter(row => row.dashboard_store_id && Number.isInteger(Number(row.tienda_id)))
    .map(row => [String(row.dashboard_store_id), Number(row.tienda_id)]));
  const rows = new Map();
  const missingStores = new Set();

  const add = (source, rubro) => {
    const tiendaId = internalByDashboard.get(String(source.storeId));
    if (!tiendaId) { missingStores.add(String(source.storeId)); return; }
    const periodId = Number(source.periodId);
    const anio = Math.floor(periodId / 100);
    const mes = periodId % 100;
    const meta = Number(source.target);
    if (!Number.isInteger(anio) || anio < 2024 || !Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isFinite(meta) || meta < 0) return;
    rows.set(`${tiendaId}|${anio}|${mes}|${rubro}`, {
      tienda_id: tiendaId, anio, mes, rubro, meta_venta: Math.round(meta * 100) / 100,
    });
  };

  // Los archivos 2024-2025 solo contienen la meta total historica. Se conserva
  // como fila legacy de solo lectura para no inventar un reparto por rubro.
  for (const row of monthlyStore) {
    const year = Math.floor(Number(row.periodId) / 100);
    if (year === 2024 || year === 2025) add(row, '');
  }
  // Desde 2026 la fuente oficial ya contiene el reparto editable por rubro.
  for (const row of monthlyCategoryTarget) {
    const rubro = String(row.category || '').trim().toUpperCase();
    if (EDITABLE_RUBROS.has(rubro)) add(row, rubro);
  }

  const orderedRows = [...rows.values()].sort((a, b) => a.anio - b.anio || a.tienda_id - b.tienda_id || a.mes - b.mes || a.rubro.localeCompare(b.rubro));
  const summary = {};
  for (const row of orderedRows) {
    const year = summary[row.anio] ||= { rows: 0, stores: new Set(), total: 0, rubros: new Set() };
    year.rows++;
    year.stores.add(row.tienda_id);
    year.total += row.meta_venta;
    year.rubros.add(row.rubro || 'TOTAL_HISTORICO');
  }
  return {
    rows: orderedRows,
    missingStores: [...missingStores].sort(),
    summary: Object.fromEntries(Object.entries(summary).map(([year, value]) => [year, {
      rows: value.rows, stores: value.stores.size,
      total: Math.round(value.total * 100) / 100,
      rubros: [...value.rubros].sort(),
    }])),
  };
}

export function compareCommercialGoalBackfill(expectedRows, storedRows) {
  const keyOf = row => `${Number(row.tienda_id)}|${Number(row.anio)}|${Number(row.mes)}|${String(row.rubro || '')}`;
  const stored = new Map((storedRows || []).map(row => [keyOf(row), Number(row.meta_venta)]));
  const missing = [];
  const conflicting = [];
  let matching = 0;
  for (const row of expectedRows || []) {
    const key = keyOf(row);
    if (!stored.has(key)) missing.push(key);
    else if (Math.abs(stored.get(key) - Number(row.meta_venta)) > 0.001) conflicting.push(key);
    else matching++;
  }
  return { matching, missing, conflicting };
}
