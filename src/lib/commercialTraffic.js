// Traffic is registered independently from the published sales batch.
export function mergeCommercialTraffic(dashboard, summary) {
  const daily = summary.daily || [];
  const totals = new Map();
  for (const row of daily) {
    const periodId = Number(row.date.slice(0, 4)) * 100 + Number(row.date.slice(5, 7));
    const key = `${periodId}|${row.storeId}`;
    const current = totals.get(key) || { periodId, storeId: row.storeId, traffic: 0 };
    current.traffic += Number(row.traffic) || 0;
    totals.set(key, current);
  }
  const existing = new Set((dashboard.monthlyStore || []).map(row => `${row.periodId}|${row.storeId}`));
  const monthlyStore = (dashboard.monthlyStore || []).map(row => ({ ...row, traffic: totals.get(`${row.periodId}|${row.storeId}`)?.traffic ?? 0 }));
  for (const [key, row] of totals) if (!existing.has(key)) monthlyStore.push({
    gross: 0, positiveReal: 0, notes: 0, discount: 0, net: 0, transactions: 0, units: 0, received: 0, ...row,
  });
  const years = [...new Set([...(dashboard.metadata.years || []), ...daily.map(row => Number(row.date.slice(0, 4)))])].sort((a, b) => a - b);
  const cutoff = summary.cutoff || daily.map(row => row.date).sort().at(-1);
  return { ...dashboard, monthlyStore, dailyTraffic: daily, metadata: { ...dashboard.metadata, years, trafficCutoff: cutoff || dashboard.metadata.trafficCutoff } };
}

export function availableTrafficMonths(daily, year, storeIds) {
  return [...new Set(daily.filter(row => Number(row.date.slice(0, 4)) === year && storeIds.has(row.storeId)).map(row => Number(row.date.slice(5, 7))))].sort((a, b) => a - b);
}

// Keep missing traffic distinct from a recorded zero and track the actual
// coverage of the stores selected in the monthly chart.
export function trafficMonthsForStores(daily, year, stores) {
  const months = new Map();
  for (const row of daily) {
    const store = stores.get(row.storeId);
    if (!store || Number(row.date.slice(0, 4)) !== year) continue;
    if (store.openingDate && row.date < store.openingDate) continue;
    if (store.closingDate && row.date > store.closingDate) continue;
    const month = Number(row.date.slice(5, 7));
    const current = months.get(month);
    months.set(month, {
      traffic: (current?.traffic ?? 0) + row.traffic,
      through: !current || row.date > current.through ? row.date : current.through,
    });
  }
  return months;
}
