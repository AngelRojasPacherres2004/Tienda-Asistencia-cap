import type { StockInsights } from './cloud-data.service';

export function stockInsightsCommonKey(filters: Record<string, unknown>): string {
  const { horizonDays: _horizonDays, ...common } = filters;
  return JSON.stringify(common);
}

/** Retain unchanged datasets so unrelated chart options do not get rebuilt. */
export function mergeStockInsights(previous: StockInsights | null, incoming: StockInsights): StockInsights {
  if (!previous) return incoming;
  const result = { ...incoming };
  for (const key of ['brandRows', 'healthRows', 'projectionRows', 'riskRows', 'priorityProducts'] as const) {
    if (JSON.stringify(previous[key]) === JSON.stringify(incoming[key])) Object.assign(result, { [key]: previous[key] });
  }
  return result;
}
