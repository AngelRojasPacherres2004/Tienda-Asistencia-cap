export function conversionComparable(salesCutoff: string, trafficCutoff: string | undefined, through: string): boolean {
  return !trafficCutoff || trafficCutoff >= (through < salesCutoff ? through : salesCutoff);
}

/**
 * Último día seleccionable en el calendario comercial.
 *
 * Tráfico se actualiza de forma independiente y puede llegar después de las
 * ventas. Nunca puede extender el calendario de ventas: elegir un día sin
 * ventas publicadas generaría una pantalla vacía y daría una impresión falsa
 * de que el corte cambió.
 */
export function salesCalendarMax(salesCutoff: string | undefined, year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const period = `${year}-${String(month).padStart(2, '0')}`;
  return salesCutoff?.slice(0, 7) === period
    ? salesCutoff
    : `${period}-${String(lastDay).padStart(2, '0')}`;
}

export function stockPeriodForDate(periods: number[], files: string[], targetDate: string, stockCutoff: string): number | null {
  const archived = files.flatMap(name => {
    const match = name.match(/^dashboard-stock-price-range-(\d{4})-(0[1-9]|1[0-2])\.json$/);
    return match ? [Number(match[1]) * 100 + Number(match[2])] : [];
  });
  const currentPeriod = Number(stockCutoff.slice(0, 4)) * 100 + Number(stockCutoff.slice(5, 7));
  return [...new Set([...periods, ...archived])].sort((a, b) => a - b).filter(period => {
    const year = Math.floor(period / 100), month = period % 100;
    const snapshotDate = period === currentPeriod ? stockCutoff : `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
    return snapshotDate <= targetDate;
  }).at(-1) ?? null;
}
