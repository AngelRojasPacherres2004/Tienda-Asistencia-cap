import test from "node:test";
import assert from "node:assert/strict";
import { rebalanceSimulatedTraffic } from "../shared/simulated-traffic.js";

test("estimated hours peak in the evening without changing any store/day total", () => {
  const rows = [1, 2].flatMap((store) => Array.from({ length: 13 }, (_, index) => ({
    tienda_id: store, fecha: "2026-09-30", rango_hora: `${String(index + 9).padStart(2, "0")}:00-${String(index + 10).padStart(2, "0")}:00`,
    cantidad: store === 1 ? 8 : 9, observaciones: "Flujo regular",
  })));
  const original = JSON.parse(JSON.stringify(rows));
  const { records, adjustedGroups } = rebalanceSimulatedTraffic(rows);
  assert.equal(adjustedGroups, 2);
  assert.deepEqual(rows, original);
  for (const store of [1, 2]) {
    const before = rows.filter((row) => row.tienda_id === store).reduce((sum, row) => sum + row.cantidad, 0);
    const after = records.filter((row) => row.tienda_id === store);
    assert.equal(after.reduce((sum, row) => sum + row.cantidad, 0), before);
    const peak = after.reduce((winner, row) => row.cantidad > winner.cantidad ? row : winner);
    assert.match(peak.rango_hora, /^(18|19|20|21):/);
  }
});

test("real or partially documented records remain unchanged", () => {
  const rows = Array.from({ length: 13 }, (_, index) => ({ tienda_id: 1, fecha: "2026-09-30", rango_hora: `${index + 9}:00`, cantidad: 10, observaciones: index ? "Flujo regular" : "Conteo real" }));
  assert.deepEqual(rebalanceSimulatedTraffic(rows), { records: rows, adjustedGroups: 0 });
});
