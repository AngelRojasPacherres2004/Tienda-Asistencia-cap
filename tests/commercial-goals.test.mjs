import test from "node:test";
import assert from "node:assert/strict";
import { aggregateCommercialGoalTotals, normalizeGoalRubro } from "../netlify/lib/commercial-goals.js";

test("solo TEXTIL y CALZADO son alcances editables", () => {
  assert.equal(normalizeGoalRubro(" textil "), "TEXTIL");
  assert.equal(normalizeGoalRubro("CALZADO"), "CALZADO");
  assert.equal(normalizeGoalRubro("TOTAL"), "");
});

test("el total comercial se calcula sumando ambos rubros por tienda y mes", () => {
  const result = aggregateCommercialGoalTotals([
    { tienda_id: 1, anio: 2027, mes: 1, rubro: "TEXTIL", meta_venta: 100 },
    { tienda_id: 1, anio: 2027, mes: 1, rubro: "CALZADO", meta_venta: 60 },
    { tienda_id: 1, anio: 2027, mes: 2, rubro: "TEXTIL", meta_venta: 90 },
    { tienda_id: 2, anio: 2027, mes: 1, rubro: "CALZADO", meta_venta: 50 },
    { tienda_id: 1, anio: 2026, mes: 1, rubro: "TEXTIL", meta_venta: 999 },
  ], 2027, 8, "2026-10-23T10:00:00.000Z");
  assert.deepEqual(result.totalRows.map(row => [row.tienda_id, row.mes, row.meta_venta]), [[1, 1, 160], [1, 2, 90], [2, 1, 50]]);
  assert.equal(result.annualTarget, 300);
});
