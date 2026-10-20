import test from "node:test";
import assert from "node:assert/strict";
import { normalizedPersonnelFields } from "../shared/personnelNormalization.js";

test("separa nacionalidad ingresada por error como distrito sin inventar ubicación", () => {
  assert.deepEqual(normalizedPersonnelFields({ distrito: "PERUANA", nacionalidad: "", carrera: "NINGUNA" }), {
    distrito: null, nacionalidad: "Peruana", carrera: null,
  });
});

test("normaliza alias seguros y conserva carreras informadas", () => {
  assert.deepEqual(normalizedPersonnelFields({ distrito: "sjl", nacionalidad: "Peruana", carrera: "Enfermería" }), {
    distrito: "SAN JUAN DE LURIGANCHO", nacionalidad: "Peruana", carrera: "Enfermería",
  });
});
