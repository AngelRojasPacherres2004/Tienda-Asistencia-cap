// Only the known demo rows are redistributed for presentation. Recorded traffic
// and the daily/store accumulated totals remain untouched.
const demoDescriptions = new Set([
  "Franja de mayor afluencia",
  "Flujo regular",
  "Afluencia simulada",
]);
const isDemoRow = (row) => demoDescriptions.has(String(row.observaciones || "").trim())
  || /\bAfluencia horaria de ejemplo\./.test(String(row.observaciones || ""));

const hourWeights = new Map([
  [9, 0.45], [10, 0.55], [11, 0.76], [12, 0.95], [13, 1.07],
  [14, 0.94], [15, 0.88], [16, 1.03], [17, 1.27],
  [18, 1.78], [19, 2.12], [20, 2.35], [21, 1.86],
]);

export function rebalanceSimulatedTraffic(records) {
  const result = records.map((row) => ({ ...row }));
  const groups = new Map();
  result.forEach((row, index) => {
    const key = `${row.tienda_id}|${row.fecha}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  let adjustedGroups = 0;
  for (const indices of groups.values()) {
    const rows = indices.map((index) => result[index]);
    if (rows.length < 8 || !rows.every(isDemoRow)) continue;
    const total = rows.reduce((sum, row) => sum + Number(row.cantidad || 0), 0);
    if (!Number.isSafeInteger(total) || total < 0) continue;
    const weights = rows.map((row) => hourWeights.get(Number(row.rango_hora?.slice(0, 2))) || 0.3);
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const exact = weights.map((weight) => total * weight / weightTotal);
    const counts = exact.map(Math.floor);
    let remaining = total - counts.reduce((sum, count) => sum + count, 0);
    const order = exact.map((value, index) => ({ index, remainder: value - counts[index] }))
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
    for (let index = 0; index < remaining; index++) counts[order[index].index]++;
    indices.forEach((sourceIndex, index) => { result[sourceIndex].cantidad = counts[index]; result[sourceIndex].estimated = true; });
    adjustedGroups++;
  }
  return { records: result, adjustedGroups };
}
