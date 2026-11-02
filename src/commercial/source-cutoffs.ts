export function conversionComparable(salesCutoff: string, trafficCutoff: string | undefined, through: string): boolean {
  return !trafficCutoff || trafficCutoff >= (through < salesCutoff ? through : salesCutoff);
}
