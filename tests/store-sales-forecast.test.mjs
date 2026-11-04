import test from "node:test";
import assert from "node:assert/strict";
import { buildStoreSalesForecast } from "../netlify/lib/store-sales-forecast.js";

const input = {
  salesCutoff: "2026-10-23",
  monthlySales: [
    { periodId: 202510, net: 620000 },
    { periodId: 202608, net: 700000 },
    { periodId: 202609, net: 750000 },
    { periodId: 202610, net: 620000 },
  ],
  monthlyTargets: [{ periodId: 202610, target: 900000 }, { periodId: 202611, target: 930000 }],
  predictive: { sales30: 780000 },
  traffic: Array.from({ length: 35 }, (_, index) => ({ fecha: new Date(Date.UTC(2026, 8, 19 + index)).toISOString().slice(0, 10), cantidad: 180 + index * 2 })),
  attendance: Array.from({ length: 30 }, (_, index) => ({ fecha: new Date(Date.UTC(2026, 8, 24 + index)).toISOString().slice(0, 10), estado: index % 12 ? "presente" : "falta" })),
};

test("pronostica el mes completo, conserva totales y expone incertidumbre", () => {
  const result = buildStoreSalesForecast(input);
  assert.equal(result.weekStart, "2026-10-01");
  assert.equal(result.weekEnd, "2026-10-31");
  assert.equal(result.days.length, 31);
  assert.equal(result.target, 900000);
  assert.equal(result.monthStart, "2026-10-01");
  assert.equal(result.monthEnd, "2026-10-31");
  assert.equal(Math.round(result.days.reduce((sum, day) => sum + day.target, 0) * 100), 90000000);
  assert.equal(result.expected, Math.round(result.days.reduce((sum, day) => sum + day.expected, 0) * 100) / 100);
  assert.ok(result.lower < result.expected);
  assert.ok(result.upper > result.expected);
  assert.ok(result.confidence >= 45 && result.confidence <= 91);
  assert.ok(result.days.every(day => day.lower <= day.expected && day.expected <= day.upper));
});

test("un tráfico reciente mayor incrementa el pronóstico sin saltos extremos", () => {
  const growing = buildStoreSalesForecast(input);
  const flat = buildStoreSalesForecast({ ...input, traffic: input.traffic.map(row => ({ ...row, cantidad: 200 })) });
  assert.ok(growing.expected > flat.expected);
  assert.ok(growing.expected / flat.expected < 1.08);
});

test("incluye cada día del mes sin cruzar a otro y conserva metas con centavos", () => {
  for (const [cutoff, count] of [["2026-02-28", 28], ["2024-02-29", 29], ["2026-04-30", 30], ["2026-12-31", 31]]) {
    const periodId = Number(cutoff.slice(0, 7).replace('-', ''));
    const result = buildStoreSalesForecast({ ...input, salesCutoff: cutoff,
      monthlyTargets: [{ periodId, target: 123456.78 }] });
    assert.equal(result.days.length, count);
    assert.equal(result.monthStart, `${cutoff.slice(0, 7)}-01`);
    assert.equal(result.monthEnd, cutoff);
    assert.equal(new Set(result.days.map(day => day.date)).size, count);
    assert.ok(result.days.every(day => day.date.startsWith(cutoff.slice(0, 7))));
    assert.equal(result.target, 123456.78);
    assert.equal(Math.round(result.days.reduce((sum, day) => sum + day.target, 0) * 100), 12345678);
  }
});

test("noviembre usa su meta mensual aunque el corte de ventas sea octubre", () => {
  const result = buildStoreSalesForecast({ ...input, salesCutoff: "2026-10-31", forecastMonth: "2026-11",
    monthlyTargets: [{ periodId: 202610, target: 637370 }, { periodId: 202611, target: 787629 }] });
  assert.equal(result.salesCutoff, "2026-10-31");
  assert.equal(result.monthStart, "2026-11-01");
  assert.equal(result.monthEnd, "2026-11-30");
  assert.equal(result.days.length, 30);
  assert.equal(result.target, 787629);
  assert.ok(result.days.every(day => day.target === 26254.3));
  assert.ok(result.expected > 0);
});
