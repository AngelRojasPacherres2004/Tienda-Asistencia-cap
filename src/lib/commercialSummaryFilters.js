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

export function operationalStoreIds(stores) {
  return [...new Set(stores.map(store => Number(store.tiendaId)).filter(id => Number.isInteger(id) && id > 0))].map(String);
}

export function mergeStoreSummaries(dashboards) {
  const summary = {};
  const courses = new Map();
  for (const dashboard of dashboards) {
    for (const [key, value] of Object.entries(dashboard.summary || {})) {
      if (typeof value === 'number') summary[key] = (summary[key] || 0) + value;
    }
    for (const row of dashboard.progresoCursos || []) {
      const key = row.curso_id || row.titulo;
      const merged = courses.get(key) || { ...row, completados: 0, en_curso: 0, pendientes: 0 };
      for (const field of ['completados', 'en_curso', 'pendientes']) merged[field] += Number(row[field] || 0);
      courses.set(key, merged);
    }
  }
  return { ...dashboards[0], summary, progresoCursos: [...courses.values()], attendanceByWorker: dashboards.flatMap(row => row.attendanceByWorker || []) };
}
