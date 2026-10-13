import test from "node:test";
import assert from "node:assert/strict";
import { COMMERCIAL_BATCH_MAX_BYTES, COMMERCIAL_BATCH_SOURCES, commercialBatchPath, commercialBatchSources, validateCutoff } from "../shared/commercialBatch.js";
import { normalizedReportPath } from "../shared/normalizedReports.js";

test("el lote exige exactamente las cuatro fuentes RMS", () => {
  assert.deepEqual(COMMERCIAL_BATCH_SOURCES.map(item => item.id), ["ventas", "stock", "ingresos", "transferencias"]);
  assert.equal(COMMERCIAL_BATCH_MAX_BYTES, 300 * 1024 * 1024);
  assert.equal(commercialBatchSources(COMMERCIAL_BATCH_SOURCES.map(item => ({ source: item.id }))).length, 4);
  assert.throws(() => commercialBatchSources([{ source: "ventas" }]));
  assert.throws(() => commercialBatchSources(["ventas", "ventas", "stock", "ingresos"].map(source => ({ source }))));
});

test("fecha de corte, lote y reportes tienen rutas controladas", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(validateCutoff("2026-09-30"), "2026-09-30");
  assert.throws(() => validateCutoff("2026-02-30"));
  assert.equal(commercialBatchPath(id), `commercial-intake/${id}.json`);
  assert.throws(() => commercialBatchPath("../otro"));
  assert.equal(normalizedReportPath("20261009T163742Z-18015098d4a3", "ventas", "T012"),
    "commercial-reports/20261009T163742Z-18015098d4a3/ventas/T012.csv");
  assert.throws(() => normalizedReportPath("../release", "ventas", "T012"));
  assert.throws(() => normalizedReportPath("20261009T163742Z-18015098d4a3", "ventas", "../T012"));
});
