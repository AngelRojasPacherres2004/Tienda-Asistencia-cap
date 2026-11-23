export const TRAFFIC_HEAT_COLORS = ['#edb7b1', '#f2d4bd', '#eee6ce', '#c4d6bd', '#91b493'];

export function trafficHeatScale(rows) {
  const values = rows.flatMap(row => row.cells).filter(cell => cell.recorded).map(cell => cell.value);
  if (!values.length) return { ranges: [], color: () => '#f1f3f2' };
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const level = value => maximum === minimum ? 2 : Math.min(4, Math.floor((value - minimum) / (maximum - minimum) * 4));
  const ranges = TRAFFIC_HEAT_COLORS.flatMap((color, index) => {
    const start = maximum === minimum ? minimum : minimum + Math.ceil(index * (maximum - minimum) / 4);
    const end = maximum === minimum ? maximum : index === 4 ? maximum : minimum + Math.ceil((index + 1) * (maximum - minimum) / 4) - 1;
    if (maximum === minimum && index !== 2 || start > end) return [];
    return [{ color, label: start === end ? String(start) : start + '\u2013' + end }];
  });
  return { ranges, color: cell => cell.recorded ? TRAFFIC_HEAT_COLORS[level(cell.value)] : '#f1f3f2' };
}
