const kpiModalIds = new Set([
  'projection-close-modal', 'ticket-modal', 'conversion-modal', 'traffic-modal',
  'saleM2-modal', 'saleCollaborator-modal', 'markup-modal', 'sellThrough-modal',
]);

export const isTopKpiModal = moduleId => kpiModalIds.has(moduleId);

export function highlightNumericColumns(rows) {
  const columns = Math.max(0, ...rows.map(row => row.cells.length));
  const bounds = Array.from({ length: columns }, (_, index) => {
    const values = rows.map(row => row.cells[index]?.value).filter(value => typeof value === 'number' && Number.isFinite(value));
    return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
  });
  return rows.map(row => ({ ...row, cells: row.cells.map((cell, index) => {
    const bound = bounds[index];
    if (!bound || bound.min === bound.max || typeof cell.value !== 'number' || !Number.isFinite(cell.value)) return cell;
    const extreme = cell.value === bound.min ? 'min' : cell.value === bound.max ? 'max' : '';
    if (!extreme) return cell;
    const description = extreme === 'min' ? 'Menor valor de la columna' : 'Mayor valor de la columna';
    return { ...cell, className: [cell.className, `ticket-extreme-${extreme}`].filter(Boolean).join(' '), title: [cell.title, description].filter(Boolean).join(' · ') };
  }) }));
}
