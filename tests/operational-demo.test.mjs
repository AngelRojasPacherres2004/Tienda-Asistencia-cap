import test from "node:test";
import assert from "node:assert/strict";
import { datesBetween, demoTrafficRecords, demoTrafficTotal, demoZonalComparison } from "../src/lib/operationalDemo.js";

test("la vista demo conserva la respuesta original y concilia tráfico por tienda", () => {
  const original = { tiendas: [{ id: 12, nombre: "AYACUCHO", personal: 17, visitas: 0 }] };
  const dates = datesBetween("2026-10-10", "2026-10-11");
  const demo = demoZonalComparison(original, dates[0], dates[1]);
  assert.equal(original.tiendas[0].visitas, 0);
  assert.equal(demo.tiendas[0].visitas, demoTrafficTotal(original.tiendas[0], dates));
  assert.equal(demoTrafficRecords(original.tiendas, dates).reduce((sum, row) => sum + row.cantidad, 0), demo.tiendas[0].visitas);
  assert.equal(demo.tiendas[0].presentes + demo.tiendas[0].tardanzas + demo.tiendas[0].faltas + demo.tiendas[0].pendientes, 17);
  assert.ok(demo.tiendas[0].visitas > 0);
});

test("la muestra horaria es determinista y concentra el pico en la tarde", () => {
  const records = demoTrafficRecords([{ id: 12 }], ["2026-10-11"]);
  assert.equal(records.length, 14);
  assert.ok(records.find((row) => row.rango_hora === "20:00-21:00").cantidad > records.find((row) => row.rango_hora === "11:00-12:00").cantidad);
  assert.deepEqual(records, demoTrafficRecords([{ id: 12 }], ["2026-10-11"]));
});
