import test from "node:test";
import assert from "node:assert/strict";
import { commercialAccess, validCommercialPartPath } from "../netlify/lib/commercial-access.js";

const map = [
  { dashboard_store_id: "T001", tienda_id: 22, cluster_code: "A" },
  { dashboard_store_id: "T002", tienda_id: 13, cluster_code: "B" },
];

test("commercial manager can see all stores", () => {
  assert.deepEqual(commercialAccess({ rol: "gerente_comercial", estado: "activo" }, { scope_type: "all", scope_value: null }, map),
    { scopeType: "all", scopeValue: null, storeIds: ["T001", "T002"] });
});

test("store chief is limited to the mapped store", () => {
  const account = { rol: "jefe_tienda", estado: "activo", tienda_id: 22 };
  assert.deepEqual(commercialAccess(account, { scope_type: "store", scope_value: "T001" }, map).storeIds, ["T001"]);
  assert.equal(commercialAccess(account, { scope_type: "store", scope_value: "T002" }, map), null);
});

test("zonal assignment must match the live cluster", () => {
  const account = { rol: "jefe_zonal", estado: "activo" };
  assert.deepEqual(commercialAccess(account, { scope_type: "cluster", scope_value: "A" }, map, { codigo: "A", estado: "activo" }).storeIds, ["T001"]);
  assert.equal(commercialAccess(account, { scope_type: "cluster", scope_value: "B" }, map, { codigo: "A", estado: "activo" }), null);
});

test("security, systems and inactive accounts have no commercial access", () => {
  for (const role of ["seguridad", "sistemas", "jefe_seguridad"]) {
    assert.equal(commercialAccess({ rol: role, estado: "activo" }, { scope_type: "all" }, map), null);
  }
  assert.equal(commercialAccess({ rol: "gerente_comercial", estado: "inactivo" }, { scope_type: "all" }, map), null);
});

test("published parts may be reused without crossing a store or cluster boundary", () => {
  const version = "20261009T160000Z-012345abcdef";
  const file = "dashboard-brand.json";
  const store = { scopeType: "store", scopeValue: "T001" };
  assert.equal(validCommercialPartPath(`${version}/scoped/store/T001/${file}.gz/part-0001`, store, file), true);
  assert.equal(validCommercialPartPath(`${version}/scoped/store/T002/${file}.gz/part-0001`, store, file), false);
  assert.equal(validCommercialPartPath(`${version}/scoped/cluster/A/${file}.gz/part-0001`, store, file), false);
  assert.equal(validCommercialPartPath(`${version}/${file}.gz/part-0001`, store, file), false);
  assert.equal(validCommercialPartPath(`${version}/${file}.gz/part-0001`, { scopeType: "all" }, file), true);
  assert.equal(validCommercialPartPath(`${version}/scoped/store/T001/${file}.gz/part-0001`, { scopeType: "all" }, file), false);
});
