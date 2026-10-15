export const SECURITY_TRAFFIC_HOURS = Object.freeze(Array.from({ length: 14 }, (_, index) => index + 9));
const weights = [.45, .55, .76, .95, 1.07, .94, .88, 1.03, 1.27, 1.78, 2.12, 2.35, 1.86, .36];

export function allocateDailySecurityTraffic(total, storeId, date) {
  if (!Number.isInteger(total) || total < 0) throw new Error('El total diario debe ser un entero no negativo.');
  const weighted = weights.map((base, index) => base *
    (1 + (((storeId * 13 + Number(date.slice(-2)) * 7 + index * 11) % 9) - 4) / 100));
  const divisor = weighted.reduce((sum, value) => sum + value, 0);
  const exact = weighted.map(value => total * value / divisor);
  const counts = exact.map(Math.floor);
  const remaining = total - counts.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - counts[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < remaining; index += 1) counts[order[index].index] += 1;
  return counts;
}
