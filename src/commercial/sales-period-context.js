export function publishedSalesPeriods(periods, salesCutoff) {
  const last = Number(salesCutoff?.slice(0, 4)) * 100 + Number(salesCutoff?.slice(5, 7));
  return [...new Set(periods)].filter(period => period <= last).sort((a, b) => a - b);
}

export function publishedSalesDays(periods, salesCutoff, from = '', to = '') {
  const valid = publishedSalesPeriods(periods, salesCutoff);
  if (from) {
    const end = (to || from) < salesCutoff ? (to || from) : salesCutoff;
    if (from > end || !valid.length) return 0;
    return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
  }
  return valid.reduce((total, period) => {
    const year = Math.floor(period / 100), month = period % 100;
    const days = `${year}-${String(month).padStart(2, '0')}` === salesCutoff.slice(0, 7) ? Number(salesCutoff.slice(8, 10)) : new Date(Date.UTC(year, month, 0)).getUTCDate();
    return total + days;
  }, 0);
}

export function averageRecordedPersonnel(rows, periods) {
  const counts = new Map();
  for (const row of rows) if (periods.has(row.periodId)) counts.set(row.periodId, (counts.get(row.periodId) || 0) + Number(row.personnel || 0));
  const values = [...counts.values()].filter(value => value > 0);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}
