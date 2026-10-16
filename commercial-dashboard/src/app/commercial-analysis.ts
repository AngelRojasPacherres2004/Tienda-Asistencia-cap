type PriceRow = { bandOrder?: number; net: number; units: number };
const PRICE_BANDS = ['S/ 0–30', 'S/ 31–60', 'S/ 61–90', 'S/ 91–120', 'S/ 121–150', 'S/ 151–180', 'S/ 181–210', 'S/ 211–240', 'S/ 241–270', 'S/ 271–300', 'S/ 301+'];

export function comparePriceRanges(current: PriceRow[], comparison: PriceRow[]) {
  const summarize = (rows: PriceRow[]) => PRICE_BANDS.map((label, index) => {
    const selected = rows.filter(row => Number(row.bandOrder) === index + 1);
    return { label, net: selected.reduce((sum, row) => sum + row.net, 0), units: selected.reduce((sum, row) => sum + row.units, 0) };
  });
  const actual = summarize(current), previous = summarize(comparison);
  const total = actual.reduce((sum, row) => sum + row.net, 0);
  return actual.map((row, index) => ({ ...row, available: current.length > 0, share: total ? row.net / total : null,
    averagePrice: row.units ? row.net / row.units : null,
    comparisonNet: comparison.length ? previous[index].net : null,
    comparisonUnits: comparison.length ? previous[index].units : null,
    change: current.length && comparison.length && previous[index].net !== 0 ? (row.net - previous[index].net) / Math.abs(previous[index].net) : null }));
}

export function personnelGender(value: unknown): 'M' | 'F' | 'N/A' {
  const key = String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (['M', 'MASCULINO', 'HOMBRE', 'MALE'].includes(key)) return 'M';
  if (['F', 'FEMENINO', 'MUJER', 'FEMALE'].includes(key)) return 'F';
  return 'N/A';
}

export function personnelGenderCounts(profiles: { gender: unknown }[]) {
  const counts = { male: 0, female: 0, unspecified: 0, total: profiles.length };
  for (const profile of profiles) {
    const gender = personnelGender(profile.gender);
    if (gender === 'M') counts.male++;
    else if (gender === 'F') counts.female++;
    else counts.unspecified++;
  }
  return counts;
}

export function stockByStore(rows: { storeId: string; units: number; value: number }[], stores: { storeId: string; alias?: string; store: string }[]) {
  const names = new Map(stores.map(store => [store.storeId, store.alias || store.store]));
  const groups = new Map<string, { storeId: string; label: string; units: number; value: number }>();
  for (const row of rows) {
    const target = groups.get(row.storeId) || { storeId: row.storeId, label: names.get(row.storeId) || row.storeId, units: 0, value: 0 };
    target.units += row.units; target.value += row.value; groups.set(row.storeId, target);
  }
  return [...groups.values()].sort((a, b) => b.units - a.units || a.label.localeCompare(b.label, 'es'));
}
