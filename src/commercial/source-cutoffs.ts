export function conversionComparable(salesCutoff: string, trafficCutoff: string | undefined, through: string): boolean {
  return !trafficCutoff || trafficCutoff >= (through < salesCutoff ? through : salesCutoff);
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
