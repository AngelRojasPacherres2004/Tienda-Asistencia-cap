const categoryNames = new Set(["TEXTIL", "CALZADO"]);

function inputError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function stringList(value, label, limit) {
  if (!Array.isArray(value) || value.length > limit || value.some(item => typeof item !== "string" || item.length > 120)) {
    throw inputError(`${label} no es un filtro válido.`);
  }
  return [...new Set(value.map(item => item.trim()).filter(Boolean))];
}

function boundedNumber(value, label, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw inputError(`${label} está fuera de rango.`);
  return number;
}

export function stockInsightParams(access, release, input) {
  const allowed = new Set(access.storeIds || []);
  const storeIds = stringList(input.storeIds, "Tiendas", 100);
  if (!storeIds.length || storeIds.some(id => !allowed.has(id))) throw inputError("Una tienda está fuera de tu alcance.", 403);
  const rubros = stringList(input.rubros, "Rubros", 2);
  if (rubros.some(name => !categoryNames.has(name))) throw inputError("Solo se admiten TEXTIL y CALZADO.");
  const lines = stringList(input.lines, "Líneas", 100);
  const sublines = stringList(input.sublines, "Sublíneas", 100);
  const horizon = boundedNumber(input.horizonDays, "Horizonte", 0, 90);
  if (![0, 30, 60, 90].includes(horizon)) throw inputError("Horizonte no válido.");
  return {
    p_cutoff: release.stock_cutoff,
    p_store_ids: storeIds,
    p_rubros: rubros,
    p_lines: lines,
    p_sublines: sublines,
    p_window_days: boundedNumber(input.windowDays, "Ventana", 1, 3650),
    p_movement_days: boundedNumber(input.movementDays, "Movimiento", 1, 3650),
    p_healthy_days: boundedNumber(input.healthyDays, "Cobertura saludable", 1, 3650),
    p_overstock_days: boundedNumber(input.overstockDays, "Sobrestock", 1, 3650),
    p_merma_pct: boundedNumber(input.mermaPct, "Merma", 0, 50),
    p_horizon_days: horizon,
  };
}

const cache = new Map();

export async function commercialStockInsights(supabase, access, release, input) {
  const params = stockInsightParams(access, release, input);
  const key = JSON.stringify(params);
  const cached = cache.get(key);
  if (cached?.expires > Date.now()) return cached.value;
  const { data, error } = await supabase.rpc("dashboard_stock_insights", params);
  if (error) throw error;
  if (!data || typeof data !== "object") throw inputError("El corte de inventario no está disponible.", 503);
  const bytes = Buffer.byteLength(JSON.stringify(data), "utf8");
  if (bytes >= 5_000_000) throw inputError("La consulta excede el límite del panel.", 503);
  cache.set(key, { value: data, expires: Date.now() + 60_000 });
  if (cache.size > 100) {
    for (const [entry, value] of cache) if (value.expires <= Date.now()) cache.delete(entry);
    while (cache.size > 100) cache.delete(cache.keys().next().value);
  }
  return data;
}
