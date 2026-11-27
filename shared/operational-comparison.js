// The comparison API accepts one calendar month per request.
export function comparisonMonthRanges(ranges, today) {
  return ranges.flatMap(range => {
    const parts = [];
    const until = range.hasta < today ? range.hasta : today;
    let from = range.desde;
    while (from <= until) {
      const [year, month] = from.split('-').map(Number);
      const last = `${from.slice(0, 7)}-${new Date(year, month, 0).getDate()}`;
      const end = last < until ? last : until;
      parts.push({ desde: from, hasta: end });
      from = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`;
    }
    return parts;
  });
}

export function mergeOperationalComparisons(results, storeIds) {
  const merged = new Map();
  for (const result of results) for (const row of result.tiendas || []) {
    if (!storeIds.includes(String(row.id))) continue;
    const prior = merged.get(row.id);
    const next = { ...row };
    // Sum events; headcount, staffing targets and document alerts are snapshots.
    if (prior) for (const field of ['presentes', 'tardanzas', 'faltas', 'pendientes', 'visitas', 'incidencias_administrativas', 'incidencias_seguridad', 'errores']) {
      next[field] = (Number(row[field]) || 0) + (Number(prior[field]) || 0);
    }
    merged.set(row.id, next);
  }
  return [...merged.values()];
}
