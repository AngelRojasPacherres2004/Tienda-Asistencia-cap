import test from "node:test";
import assert from "node:assert/strict";
import { approvedCampaigns, approvedValidations, campaignStatus } from "../src/lib/marketingCampaigns.js";

test("standalone validations can precede campaign registration", () => {
  const validations = [
    { id: 1, nombre: "Hogar", estado: "aprobada", presupuesto: 250, campana_id: null },
    { id: 2, estado: "pendiente", campana_id: null },
    { id: 3, estado: "cancelada", campana_id: null },
    { id: 4, estado: "aprobada", campana_id: 10 },
  ];
  assert.deepEqual(approvedValidations(validations).map(row => [row.id, row.nombre, row.presupuesto_previsto]), [[1, "Hogar", 250]]);
});

test("new campaigns remain pending until validated", () => {
  assert.equal(campaignStatus({ id: 1, estado_validacion: "pendiente" }, []), "pendiente");
  assert.deepEqual(approvedCampaigns([{ id: 1, estado_validacion: "pendiente" }], []), []);
});

test("approved campaigns load the validated initial budget", () => {
  const campaigns = [{ id: 1, estado_validacion: "pendiente", presupuesto_previsto: 100 }];
  const validations = [{ id: 10, campana_id: 1, estado: "aprobada", presupuesto: 250, created_at: "2026-10-02T12:00:00Z" }];
  assert.equal(approvedCampaigns(campaigns, validations)[0].presupuesto_previsto, 250);
});

test("a newer cancellation or pending decision excludes an earlier approval", () => {
  for (const estado of ["cancelada", "pendiente"]) {
    const validations = [
      { id: 1, campana_id: 2, estado: "aprobada", created_at: "2026-10-01T12:00:00Z" },
      { id: 2, campana_id: 2, estado, created_at: "2026-10-02T12:00:00Z" },
    ];
    assert.deepEqual(approvedCampaigns([{ id: 2, estado_validacion: "aprobada" }], validations), []);
  }
});

test("registered campaigns are excluded and timestamp ties use the latest id", () => {
  const validations = [
    { id: 3, campana_id: 1, estado: "aprobada", presupuesto: 0, created_at: "2026-10-02T12:00:00Z" },
    { id: 2, campana_id: 1, estado: "cancelada", created_at: "2026-10-02T12:00:00Z" },
  ];
  assert.equal(approvedCampaigns([{ id: 1 }], validations)[0].presupuesto_previsto, 0);
  assert.deepEqual(approvedCampaigns([{ id: 1, registro_completado: true }], validations), []);
});
