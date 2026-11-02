export function trafficMatrixHours(days, hours) {
  return hours.map(hour => {
    const cells = days.map(day => {
      const cell = day.cells.find(value => value.hour === hour);
      return { date: day.date, hour, value: cell?.value ?? 0, recorded: cell?.recorded ?? false };
    });
    return { hour, cells, recorded: cells.some(cell => cell.recorded), total: cells.reduce((sum, cell) => sum + cell.value, 0) };
  });
}
