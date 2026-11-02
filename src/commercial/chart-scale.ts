/** Readable ticks based on the current filtered data, without a fixed currency floor. */
export function adaptiveValueScale(values: readonly number[], divisions = 4): { max: number; interval: number } {
  const peak = values.reduce((max, value) => Number.isFinite(value) ? Math.max(max, value) : max, 0);
  if (peak <= 0) return { max: 1, interval: .25 };
  const padded = peak * 1.15;
  const rawStep = padded / Math.max(2, divisions);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / magnitude;
  const niceStep = [1, 2, 2.5, 5, 10].find(step => step >= fraction) || 10;
  const interval = Number((niceStep * magnitude).toPrecision(12));
  return { max: Number((Math.ceil(padded / interval) * interval).toPrecision(12)), interval };
}
