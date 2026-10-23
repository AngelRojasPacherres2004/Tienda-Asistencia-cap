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

test("pronostica siete días, conserva totales y expone incertidumbre", () => {
  const result = buildStoreSalesForecast(input);
  assert.equal(result.weekStart, "2026-10-26");
  assert.equal(result.weekEnd, "2026-11-01");
  assert.equal(result.days.length, 7);
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
