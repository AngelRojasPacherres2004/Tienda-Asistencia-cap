import test from "node:test";
import assert from "node:assert/strict";
import { createOperationsDomain } from "../netlify/domains/operations.js";

function setup() {
  const writes = [];
  const db = { async rpc(name, args) { writes.push({ name, args }); return { data: { id: 99 }, error: null }; }, from(table) {
    const query = {
      select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; },
      insert(value) { writes.push({ table, value }); return query; },
      single: async () => ({ data: { id: 99 }, error: null }),
      then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
    };
    return query;
  } };
  const domain = createOperationsDomain({
    createSecurityDomain: () => ({}),
    supabase: db, bodyOf: value => value,
    httpError: (message, status) => Object.assign(new Error(message), { status }),
    dbError: error => new Error(error.message),
    requireFields: () => {}, isISODate: value => /^\d{4}-\d{2}-\d{2}$/.test(value),
    cleanText: value => String(value || "").trim(), normalizeLaborArea: value => value,
    validIds: values => { const ids = [...new Set(values.map(Number))]; if (ids.some(id => !Number.isInteger(id) || id < 1)) throw new Error("ID inválido"); return ids; },
    storeStaffRoles: ["trabajador"],
    todayISO: () => '2026-10-28',
    readAllResult: async () => ({ data: [{ id: 7, dni: "12345678", tienda_id: 2, tiendas: { nombre: "Origen" } }], error: null }),
  });
  return { writes, save: trabajadores => domain.saveSpecialCoverage({ fecha_inicio: "2026-10-28", fecha_fin: "2026-10-28", tipo_dia: "especial", motivo: "Refuerzo", estado: "confirmada", trabajadores }, { id: 1, tienda_id: 3 }) };
}
const manual = { usuario_id: "", nombre_manual: " Persona nueva ", origen_manual: " Otra tienda ", dni: "87654321", area: "Ventas", hora_entrada: "09:00", tipo_cobertura: "apoyo" };

test("registra cobertura y asistencia en una sola operación sin horarios ni cuentas nuevas", async () => {
  const { save, writes } = setup();
  await save([manual, { usuario_id: "7", hora_entrada: "09:00", tipo_cobertura: "fijo", nombre_manual: "Ignorar" }]);
  const [external, registered] = writes[0].args.p_trabajadores;
  assert.equal(writes[0].name, 'registrar_cobertura_diaria');
  assert.equal(external.usuario_id, null);
  assert.equal(external.nombre_manual, "Persona nueva"); assert.equal(external.origen_manual, "Otra tienda"); assert.equal(external.dni_manual, "87654321");
  assert.equal(registered.usuario_id, 7); assert.equal(registered.nombre_manual, undefined);
  assert.equal(writes[0].args.p_tienda_id, 3);
  assert.equal(Object.hasOwn(external, 'hora_entrada'), false);
  assert.equal(Object.hasOwn(writes[0].args, 'fecha_inicio'), false);
});

for (const [name, changes] of [["nombre vacío", { nombre_manual: " " }], ["origen vacío", { origen_manual: "" }], ["DNI inválido", { dni: "123" }], ["usuario inexistente", { usuario_id: "88" }]]) {
  test(`rechaza ${name} antes de insertar la cobertura`, async () => {
    const { save, writes } = setup();
    await assert.rejects(save([{ ...manual, ...changes }]));
    assert.equal(writes.length, 0);
  });
}
test("permite DNI vacío para registro manual", async () => {
  const { save, writes } = setup(); await save([{ ...manual, dni: "" }]);
  assert.equal(writes[0].args.p_trabajadores[0].dni_manual, null);
});
test("rechaza duplicar un usuario registrado", async () => {
  const { save, writes } = setup(); await assert.rejects(save([{ ...manual, usuario_id: "7" }, { ...manual, usuario_id: "7" }]), /repitas/);
  assert.equal(writes.length, 0);
});
