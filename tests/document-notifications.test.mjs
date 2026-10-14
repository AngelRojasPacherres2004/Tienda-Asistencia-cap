import test from "node:test";
import assert from "node:assert/strict";
import { documentNotificationGroups, documentNotificationMail, notificationStores, runDocumentNotifications } from "../netlify/lib/document-notifications.js";
import { defaultPreferences, validatePreferences } from "../netlify/lib/attendance-mail.js";

const stores = [{ id: 1, nombre: "Centro <A>", jefe: { nombres: "Ana", apellidos: "Rojas", estado: "activo" } }, { id: 2, nombre: "Norte" }];
const documents = [
  { id: 1, tienda_id: 1, tipo_documento: "Licencia <local>", codigo: "LIC-1", fecha_vencimiento: "2026-10-14", dias_alerta: 0, responsables: ["Administración"] },
  { id: 2, tienda_id: 1, tipo_documento: "ITSE", fecha_vencimiento: "2026-10-24", dias_alerta: 10 },
  { id: 3, tienda_id: 1, tipo_documento: "Fuera del plazo", fecha_vencimiento: "2026-10-25", dias_alerta: 10 },
  { id: 4, tienda_id: 1, tipo_documento: "Vencido", fecha_vencimiento: "2026-10-13" },
  { id: 5, tienda_id: 2, tipo_documento: "Seguro", fecha_vencimiento: "2026-10-20" },
  { id: 6, tienda_id: 9, tipo_documento: "Otra zona", fecha_vencimiento: "2026-10-14" },
];
test("alertas respetan las preferencias, el día del vencimiento y cada anticipación", () => {
  const groups = documentNotificationGroups(stores, documents, [], { documentos_por_vencer: true }, "2026-10-14");
  assert.deepEqual(groups[0].documents.map(document => document.id), [1, 2]);
  assert.equal(groups[1].manager, "Sin encargado activo asignado");
  assert.deepEqual(documentNotificationGroups(stores, documents, [], { documentos_vencidos: true }, "2026-10-14")[0].documents.map(document => document.id), [4]);
  assert.equal(documentNotificationGroups(stores, documents, [], {}, "2026-10-14").length, 0);
});
test("correo agrupa documentos, identifica encargados y escapa HTML", () => {
  const groups = documentNotificationGroups(stores, documents, [{ tienda_id: 2, nombres: "Luis", apellidos: "Paz", rol: "jefe_tienda", estado: "activo" }], { documentos_por_vencer: true, documentos_vencidos: true }, "2026-10-14");
  const mail = documentNotificationMail(groups, "2026-10-14");
  for (const text of ["Ana Rojas", "Luis Paz", "LIC-1", "Administración", "Vence hoy", "Vence en 10 día(s)", "Vencido hace 1 día(s)"]) assert.ok(mail.text.includes(text), text);
  assert.ok(mail.html.includes("Centro &lt;A&gt;"));
  assert.ok(!mail.html.includes("Licencia <local>"));
  assert.ok(!mail.text.includes("Otra zona"));
  assert.ok(!mail.text.includes("Fuera del plazo"));
});
test("preferencia nueva es opcional para clientes anteriores y puede ser el único aviso", () => {
  const preference = validatePreferences({ ...defaultPreferences, activo: true, registros: false, faltas: false, tardanzas: false, documentos_por_vencer: true, destinatarios: ["TEST@example.com", "test@example.com"] });
  assert.deepEqual(preference.destinatarios, ["test@example.com"]);
  const { documentos_por_vencer: _unused, ...old } = defaultPreferences;
  assert.equal(validatePreferences(old).documentos_por_vencer, false);
});

function mockDb({ duplicate = false, sendFails = false } = {}) {
  const rows = {
    notificaciones_asistencia_zonal: [{ usuario_id: 8, destinatarios: ["test@example.com"], documentos_por_vencer: true }],
    usuarios: [{ id: 8, rol: "gerencia_general", estado: "activo" }],
    tiendas: stores,
    documentos_municipales: documents,
    clusters: [{ id: 10 }],
  };
  const calls = [];
  const db = { from(table) {
    const builder = { table, filters: [], select() { return this; }, order() { return this; }, or() { return this; }, eq(key, value) { this.filters.push([key, value]); return this; }, in(key, values) { this.filters.push([key, values]); return this; },
      async range() { calls.push({ table, filters: this.filters }); return { data: rows[table].filter(row => this.filters.every(([key,value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === undefined || row[key] === value)), error: null }; },
      async maybeSingle() { return { data: rows[table][0], error: null }; },
      async insert() { calls.push({ claim: true }); return { error: duplicate ? { code: "23505" } : null }; },
      delete() { calls.push({ release: true }); return { eq() { return this; }, then(resolve) { resolve({ error: null }); } }; },
    }; return builder;
  } };
  const sent = [];
  return { db, calls, sent, send: async (...args) => { if(sendFails) throw new Error("SMTP temporal"); sent.push(args); } };
}
test("gerencia ve tiendas globales, zonal limita por clúster y cuentas inactivas no consultan tiendas", async () => {
  const mock = mockDb();
  await notificationStores(mock.db, { id: 8, rol: "gerencia_general", estado: "activo" });
  assert.ok(!mock.calls.find(call => call.table === "tiendas").filters.some(([key]) => key === "cluster_id"));
  mock.calls.length=0;
  await notificationStores(mock.db, { id: 8, rol: "jefe_zonal", estado: "activo" });
  assert.ok(mock.calls.find(call => call.table === "tiendas").filters.some(([key,values]) => key === "cluster_id" && values.includes(10)));
  assert.deepEqual(await notificationStores(mock.db, { id: 8, rol: "gerencia_general", estado: "inactivo" }), []);
});
test("resumen único por día y liberación para reintento si falla el correo", async () => {
  const normal = mockDb();
  assert.equal((await runDocumentNotifications(normal.db, normal.send, "2026-10-14")).enviados, 1);
  assert.equal(normal.sent.length, 1);
  const duplicate = mockDb({ duplicate: true });
  assert.equal((await runDocumentNotifications(duplicate.db, duplicate.send, "2026-10-14")).enviados, 0);
  const failure = mockDb({ sendFails: true });
  assert.equal((await runDocumentNotifications(failure.db, failure.send, "2026-10-14")).failures.length, 1);
  assert.ok(failure.calls.some(call => call.release));
});
