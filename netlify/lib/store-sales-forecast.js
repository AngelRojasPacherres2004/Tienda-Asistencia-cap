import { PRESENT_STATES } from "../../shared/attendance.js";
const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const RETAIL_DAY_WEIGHTS = [0.12, 0.13, 0.13, 0.14, 0.14, 0.16, 0.18];


const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const isoDate = (value) => new Date(`${value}T12:00:00Z`);
const dateISO = (value) => value.toISOString().slice(0, 10);
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

function nextMonday(value) {
  const date = isoDate(value); const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? 1 : 8 - day));
  return date;
}

function dailyRate(row, cutoff) {
  const year = Math.floor(Number(row.periodId) / 100); const month = Number(row.periodId) % 100;
  const cutoffPeriod = Number(cutoff.replaceAll("-", "").slice(0, 6));
  const days = Number(row.periodId) === cutoffPeriod ? Number(cutoff.slice(8, 10)) : daysInMonth(year, month);
  return days > 0 ? Math.max(0, Number(row.net) || 0) / days : 0;
}

function coefficientOfVariation(values) {
  if (values.length < 2) return 0.25;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!mean) return 0.4;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

export function buildStoreSalesForecast({ monthlySales = [], salesCutoff, monthlyTargets = [], traffic = [], attendance = [], predictive = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(salesCutoff || ""))) throw new Error("El corte de ventas no es válido.");
  const cutoffPeriod = Number(salesCutoff.replaceAll("-", "").slice(0, 6));
  const history = monthlySales.filter(row => Number(row.periodId) <= cutoffPeriod && Number(row.net) >= 0)
    .sort((a, b) => Number(a.periodId) - Number(b.periodId));
  const recent = history.slice(-3); const recentRates = recent.map(row => dailyRate(row, salesCutoff)).filter(value => value > 0);
  const weightedRecent = recentRates.length
    ? recentRates.reduce((sum, value, index) => sum + value * [0.2, 0.3, 0.5].slice(-recentRates.length)[index], 0)
      / [0.2, 0.3, 0.5].slice(-recentRates.length).reduce((sum, value) => sum + value, 0)
    : 0;
  const start = nextMonday(salesCutoff); const forecastMonth = start.getUTCMonth() + 1;
  const priorYearPeriod = (start.getUTCFullYear() - 1) * 100 + forecastMonth;
  const priorYearRow = history.find(row => Number(row.periodId) === priorYearPeriod);
  const priorYearRate = priorYearRow ? dailyRate(priorYearRow, salesCutoff) : 0;
  const predictiveRate = Number(predictive?.sales30) > 0 ? Number(predictive.sales30) / 30 : 0;
  const baselines = [[weightedRecent, 0.55], [priorYearRate, 0.25], [predictiveRate, 0.20]].filter(([value]) => value > 0);
  const baselineDaily = baselines.length
    ? baselines.reduce((sum, [value, weight]) => sum + value * weight, 0) / baselines.reduce((sum, [, weight]) => sum + weight, 0)
    : 0;

  const earlierRate = recentRates.length > 1 ? recentRates.slice(0, -1).reduce((sum, value) => sum + value, 0) / (recentRates.length - 1) : weightedRecent;
  const trendRaw = earlierRate > 0 ? recentRates.at(-1) / earlierRate : 1;
  const trendFactor = 1 + (clamp(trendRaw, 0.85, 1.15) - 1) * 0.45;

  const trafficByDate = new Map();
  for (const row of traffic) trafficByDate.set(row.fecha, (trafficByDate.get(row.fecha) || 0) + Math.max(0, Number(row.cantidad) || 0));
  const trafficDates = [...trafficByDate.keys()].filter(date => date <= salesCutoff).sort();
  const recentTraffic = trafficDates.slice(-14).map(date => trafficByDate.get(date));
  const priorTraffic = trafficDates.slice(-28, -14).map(date => trafficByDate.get(date));
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const trafficRaw = average(priorTraffic) > 0 ? average(recentTraffic) / average(priorTraffic) : 1;
  const trafficFactor = 1 + (clamp(trafficRaw, 0.85, 1.15) - 1) * 0.35;

  const attendanceRows = attendance.filter(row => row.fecha <= salesCutoff);
  const attendanceRate = attendanceRows.length ? attendanceRows.filter(row => PRESENT_STATES.has(row.estado)).length / attendanceRows.length : null;
  const attendanceFactor = attendanceRate == null ? 1 : 1 + (clamp(attendanceRate / 0.95, 0.92, 1.03) - 1) * 0.4;

  const targetByPeriod = new Map(monthlyTargets.map(row => [Number(row.periodId), Math.max(0, Number(row.target) || 0)]));
  const firstPeriod = start.getUTCFullYear() * 100 + forecastMonth; const firstTarget = targetByPeriod.get(firstPeriod) || 0;
  const goalDaily = firstTarget / daysInMonth(start.getUTCFullYear(), forecastMonth);
  const goalRaw = baselineDaily > 0 && goalDaily > 0 ? goalDaily / baselineDaily : 1;
  const goalFactor = 1 + (clamp(goalRaw, 0.90, 1.10) - 1) * 0.25;
  const adjustedDaily = baselineDaily * trendFactor * trafficFactor * attendanceFactor * goalFactor;

  const weekdayTraffic = Array.from({ length: 7 }, () => []);
  for (const [date, value] of trafficByDate) weekdayTraffic[isoDate(date).getUTCDay()].push(value);
  const trafficWeights = weekdayTraffic.map((values, day) => values.length ? average(values) : RETAIL_DAY_WEIGHTS[day]);
  const trafficWeightTotal = trafficWeights.reduce((sum, value) => sum + value, 0) || 1;
  const normalizedTrafficWeights = trafficWeights.map(value => value / trafficWeightTotal);
  const blendedWeights = normalizedTrafficWeights.map((value, day) => value * 0.7 + RETAIL_DAY_WEIGHTS[day] * 0.3);
  const weekWeights = Array.from({ length: 7 }, (_, index) => blendedWeights[(start.getUTCDay() + index) % 7]);
  const weekWeightTotal = weekWeights.reduce((sum, value) => sum + value, 0) || 1;

  const sources = [recentRates.length > 0, priorYearRate > 0, predictiveRate > 0, recentTraffic.length >= 7, attendanceRows.length >= 10, firstTarget > 0].filter(Boolean).length;
  const variability = coefficientOfVariation(recentRates);
  const confidence = Math.round(clamp(48 + sources * 7 - variability * 30, 45, 91));
  const uncertainty = clamp(0.25 - confidence / 1000 + variability * 0.18, 0.10, 0.24);
  const weeklyExpected = adjustedDaily * 7;
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start); date.setUTCDate(start.getUTCDate() + index);
    const expected = weeklyExpected * weekWeights[index] / weekWeightTotal;
    const periodId = date.getUTCFullYear() * 100 + date.getUTCMonth() + 1;
    const target = (targetByPeriod.get(periodId) || 0) / daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
    return { date: dateISO(date), day: DAY_NAMES[date.getUTCDay()], expected: roundMoney(expected),
      lower: roundMoney(expected * (1 - uncertainty)), upper: roundMoney(expected * (1 + uncertainty)), target: roundMoney(target),
      demandIndex: Math.round(weekWeights[index] / (weekWeightTotal / 7) * 100) };
  });
  return {
    salesCutoff, weekStart: days[0].date, weekEnd: days.at(-1).date,
    expected: roundMoney(days.reduce((sum, day) => sum + day.expected, 0)),
    lower: roundMoney(days.reduce((sum, day) => sum + day.lower, 0)),
    upper: roundMoney(days.reduce((sum, day) => sum + day.upper, 0)),
    target: roundMoney(days.reduce((sum, day) => sum + day.target, 0)), confidence, days,
    variables: { baselineDaily: roundMoney(baselineDaily), trend: trendFactor, traffic: trafficFactor, attendance: attendanceFactor, goal: goalFactor,
      attendanceRate, recentTrafficAverage: roundMoney(average(recentTraffic)), priorTrafficAverage: roundMoney(average(priorTraffic)) },
    drivers: [
      { label: "Tendencia de venta", factor: trendFactor },
      { label: "Tráfico de clientes", factor: trafficFactor, available: recentTraffic.length >= 7 },
      { label: "Asistencia operativa", factor: attendanceFactor, available: attendanceRate != null },
      { label: "Meta comercial", factor: goalFactor, available: firstTarget > 0 },
    ],
    method: "Promedio ponderado de 3 meses, misma temporada del año anterior y venta de 30 días; ajustado por tendencia, tráfico, asistencia y metas del sistema.",
  };
}
