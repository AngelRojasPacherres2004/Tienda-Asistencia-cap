export function commercialSummaryRanges({ year, months, fromDate, toDate }, today) {
  if (fromDate || toDate) return [{ desde: fromDate || toDate, hasta: toDate || fromDate }];
  const ranges = [];
  let previousMonth;
  for (const month of [...new Set(months)].sort((a, b) => a - b)) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const lastDay = new Date(Number(year), month, 0).getDate();
    const hasta = prefix === today.slice(0, 7) ? today : `${prefix}-${lastDay}`;
    if (previousMonth === month - 1) ranges.at(-1).hasta = hasta;
    else ranges.push({ desde: `${prefix}-01`, hasta });
    previousMonth = month;
  }
  return ranges;
}

export function mergeCommercialSummaries(dashboards) {
  const workers = new Map();
  for (const dashboard of dashboards) for (const row of dashboard.attendanceByWorker || []) {
    const previous = workers.get(row.usuario_id);
    const merged = { ...row };
    if (previous) for (const key of ['presente', 'tardanza', 'ausencia', 'suspension', 'total']) merged[key] = Number(previous[key] || 0) + Number(row[key] || 0);
    workers.set(row.usuario_id, merged);
  }
  return { ...dashboards[0], attendanceByWorker: [...workers.values()] };
}
