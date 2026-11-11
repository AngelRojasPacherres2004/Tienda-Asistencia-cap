// Compare sales and personnel from the same published months for each team.
export function teamProductivity(salesRows, personnelRows, selectedPeriods, salesCutoff) {
  const closingPeriod = Number(salesCutoff.slice(0, 4)) * 100 + Number(salesCutoff.slice(5, 7));
  const sales = new Map();
  const personnel = new Map();
  for (const row of personnelRows) {
    if (!selectedPeriods.has(row.periodId) || row.periodId > closingPeriod) continue;
    const key = `${row.team}|${row.periodId}`;
    personnel.set(key, (personnel.get(key) || 0) + Number(row.personnel || 0));
  }
  for (const row of salesRows) {
    if (!selectedPeriods.has(row.periodId) || row.periodId > closingPeriod || !(personnel.get(`${row.team}|${row.periodId}`) > 0)) continue;
    const team = sales.get(row.team) || new Map();
    team.set(row.periodId, (team.get(row.periodId) || 0) + Number(row.net || 0));
    sales.set(row.team, team);
  }
  return [...sales].map(([team, months]) => {
    const periodCount = months.size;
    const averageMonthlySales = [...months.values()].reduce((total, value) => total + value, 0) / periodCount;
    const averagePersonnel = [...months.keys()].reduce((total, period) => total + personnel.get(`${team}|${period}`), 0) / periodCount;
    return { team, periodCount, personnel: averagePersonnel, averageMonthlySales, productivity: averageMonthlySales / averagePersonnel };
  }).sort((a, b) => b.productivity - a.productivity);
}
