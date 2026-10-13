import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_UPLOAD_CHUNK_SIZE, SYSTEM_SOURCES, validateSystemUpload, systemPartPath, systemManifestPath } from "../shared/systemUpload.js";

test("la carga acepta cada fuente con su formato homologado", () => {
  for (const source of SYSTEM_SOURCES) {
    const result = validateSystemUpload({ source: source.id, fileName: `corte${source.extensions[0]}`, fileSize: 1 });
    assert.equal(result.definition.id, source.id);
    assert.equal(result.chunks, 1);
  }
  assert.equal(validateSystemUpload({ source: "ventas", fileName: "VENTAS_2026.parquet", fileSize: 1 }).extension, ".parquet");
});

test("los archivos grandes se dividen por debajo del límite de 6 MB del bucket", () => {
  assert.ok(SYSTEM_UPLOAD_CHUNK_SIZE < 6 * 1024 * 1024);
  assert.equal(validateSystemUpload({ source: "ventas", fileName: "Fact_Ventas.parquet", fileSize: 158676562 }).chunks, 38);
});

test("no acepta formato, tamaño o identificador inválido", () => {
  assert.throws(() => validateSystemUpload({ source: "ventas", fileName: "ventas.csv", fileSize: 100 }));
  assert.throws(() => validateSystemUpload({ source: "personal", fileName: "../personal.xlsx", fileSize: 100 }));
  assert.throws(() => validateSystemUpload({ source: "stock", fileName: "stock.parquet", fileSize: 0 }));
  assert.throws(() => validateSystemUpload({ source: "stock", fileName: "stock.parquet", fileSize: 251 * 1024 * 1024 }));
  assert.throws(() => systemPartPath("otro", 0));
  assert.throws(() => systemManifestPath("otro"));
});

test("las partes y el manifiesto usan un prefijo de recepción separado del dashboard", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(systemPartPath(id, 1), `intake/${id}/part-001.bin`);
  assert.equal(systemManifestPath(id), `intake-manifests/${id}.json`);
});
