import test from "node:test";
import assert from "node:assert/strict";
import { trainingStoreComparison } from "../src/lib/trainingComparison.js";

const stores = [{ id: 1, nombre: "Centro", cluster_id: 10 }, { id: 2, nombre: "Centro", cluster_id: 20 }, { id: 3, nombre: "Norte", cluster_id: null }];
const clusters = [{ id: 10, codigo: "A" }, { id: 20, nombre: "CLÚSTER B" }];
const person = (id, store, state, estado = "activo") => ({ id, tienda_id: store, progreso_estado: state, estado });

test("agrupa por ID de tienda, excluye inactivos y personas sin tienda, y conserva pendientes sin progreso", () => {
  const rows = trainingStoreComparison(stores, clusters, [person(1, 1, "completado"), person(2, 1), person(3, 2, "en_curso"), person(4, null, "completado"), person(5, 1, "completado", "inactivo"), person(1, 1, "completado")]);
  const first = rows.find(row => row.id === 1);
  assert.equal(first.total, 2);
  assert.equal(first.percentage, 50);
  assert.equal(first.pendiente, 1);
  assert.equal(first.majority, false);
  assert.equal(rows.find(row => row.id === 2).en_curso, 1);
  assert.equal(rows.find(row => row.id === 3).percentage, null);
  assert.equal(rows.find(row => row.id === 3).complete, false);
});

test("la mayoría exige más de la mitad, el 100% exige todas las personas y los filtros usan el clúster real", () => {
  const people = [person(1, 1, "completado"), person(2, 1, "completado"), person(3, 1, "en_curso"), person(4, 2, "completado")];
  const rows = trainingStoreComparison(stores, clusters, people);
  assert.equal(rows[0].id, 2);
  assert.equal(rows[0].complete, true);
  assert.equal(rows[1].majority, true);
  assert.equal(rows[1].complete, false);
  assert.equal(rows[1].percentage, 200 / 3);
  assert.deepEqual(trainingStoreComparison(stores, clusters, people, "A").map(row => row.id), [1]);
  assert.deepEqual(trainingStoreComparison(stores, clusters, people, "B").map(row => row.id), [2]);
  assert.equal(rows.length, 3);
});
