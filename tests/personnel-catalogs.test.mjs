import assert from "node:assert/strict";
import test from "node:test";
import { LABOR_AREAS, laborAreaOptions, normalizeLaborArea } from "../src/lib/laborAreas.js";
import { DEPARTURE_REASONS, departureReasonOptions, normalizeDepartureReason, validDepartureReason } from "../src/lib/personnelCatalogs.js";
import { clusterLabel, isCommercialCluster } from "../src/lib/clusters.js";

test("las áreas históricas equivalentes usan el mismo término", () => {
  assert.equal(normalizeLaborArea(" ADMINISTRATIVA "), "Administración");
  assert.equal(normalizeLaborArea("TECNOLOGIA"), "Tecnología");
  assert.equal(normalizeLaborArea("Área no clasificada"), "Área no clasificada");
  assert.equal(normalizeLaborArea("TEXTIL"), "Textil");
  assert.equal(normalizeLaborArea("  Hogar   /   Tecnología "), "Hogar / Tecnología");
  assert.deepEqual(laborAreaOptions(["TEXTIL", "Textil"]).filter(value => value === "Textil"), ["Textil"]);
  assert.ok(LABOR_AREAS.includes("Administración"));
});

test("motivos de salida conservan equivalencias y un catálogo cerrado", () => {
  assert.equal(normalizeDepartureReason("Mejor oferta laboral"), "MEJOR OFERTA");
  assert.equal(normalizeDepartureReason("  desercion  "), "DESERCIÓN");
  assert.equal(normalizeDepartureReason("RENUNCIA"), "RENUNCIA");
  assert.equal(validDepartureReason("Motivos personales"), true);
  assert.equal(validDepartureReason("texto libre"), false);
  assert.deepEqual(departureReasonOptions().map(([code]) => code), DEPARTURE_REASONS.map(([code]) => code));
  assert.deepEqual(departureReasonOptions("Motivo heredado").at(-1), ["Motivo heredado", "Motivo heredado (histórico)"]);
});

test("los selectores comerciales muestran únicamente los clústeres A y B", () => {
  assert.equal(clusterLabel("CLUSTER A"), "CLÚSTER A");
  assert.equal(isCommercialCluster({ codigo: "A" }), true);
  assert.equal(isCommercialCluster({ nombre: "CLUSTER B" }), true);
  assert.equal(isCommercialCluster({ codigo: "CD", nombre: "Centro de distribución" }), false);
});
