type PriceRow = { bandOrder?: number; net: number; units: number };
const BANDS = ['S/ 0–30', 'S/ 31–60', 'S/ 61–90', 'S/ 91–120', 'S/ 121–150', 'S/ 151–180', 'S/ 181–210', 'S/ 211–240', 'S/ 241–270', 'S/ 271–300', 'S/ 301+'];

export function summarizePriceBands(rows: readonly PriceRow[]) {
  const values = BANDS.map(label => ({ label, net: 0, units: 0 }));
  let available = false;
  for (const row of rows) {
    const index = Number(row.bandOrder) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= BANDS.length) continue;
    values[index].net += row.net;
    values[index].units += row.units;
    available = true;
  }
  const total = values.reduce((sum, row) => sum + row.net, 0);
  return values.map(row => ({ ...row, available, share: total ? row.net / total : null,
    averagePrice: row.units ? row.net / row.units : null }));
}

export function comparePriceBands(current: readonly PriceRow[], comparison: readonly PriceRow[]) {
  const actual = summarizePriceBands(current), other = summarizePriceBands(comparison);
  return actual.map((row, index) => ({ label: row.label, actual: row, comparison: other[index],
    saleChange: row.available && other[index].available && other[index].net !== 0
      ? (row.net - other[index].net) / Math.abs(other[index].net) : null,
    unitsChange: row.available && other[index].available && other[index].units !== 0
      ? (row.units - other[index].units) / Math.abs(other[index].units) : null }));
}
