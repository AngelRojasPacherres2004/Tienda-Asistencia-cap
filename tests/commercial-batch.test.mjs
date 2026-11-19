import test from "node:test";
import assert from "node:assert/strict";
import { COMMERCIAL_BATCH_MAX_BYTES, COMMERCIAL_BATCH_SOURCES, commercialBatchPath, commercialBatchSources, validateCutoff } from "../shared/commercialBatch.js";
import { normalizedReportPath } from "../shared/normalizedReports.js";

test("el lote exige las fuentes base y stock únicamente al cierre mensual", () => {
  assert.deepEqual(COMMERCIAL_BATCH_SOURCES.map(item => item.id), ["ventas", "ingresos", "transferencias", "stock"]);
  assert.equal(COMMERCIAL_BATCH_MAX_BYTES, 300 * 1024 * 1024);
  const receipts = COMMERCIAL_BATCH_SOURCES.map(item => ({ source: item.id, fileName: item.fileName }));
  assert.equal(commercialBatchSources(receipts, '2026-09-30').length, 4);
  assert.equal(commercialBatchSources(receipts.slice(0,3), '2026-09-29').length, 3);
  assert.throws(() => commercialBatchSources(receipts.slice(0,3), '2026-09-30'));
  assert.throws(() => commercialBatchSources(receipts, '2026-09-29'));
  assert.throws(() => commercialBatchSources([receipts[0]], '2026-09-29'));
  assert.throws(() => commercialBatchSources([receipts[0],receipts[0],...receipts.slice(1)], '2026-09-30'));
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
