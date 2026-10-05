import test from "node:test";
import assert from "node:assert/strict";
import { limaDate, nextReportRun, validateSchedule, reportSummary, attendanceCsv, attendanceReportHtml, sendScheduledReport } from "../netlify/lib/attendance-reports.js";

test("la programación respeta Lima en el cambio de día UTC", () => {
  const now = new Date("2026-09-29T03:20:00Z");
  assert.equal(limaDate(now), "2026-09-28");
  assert.equal(nextReportRun("08:30", now), "2026-09-29T13:30:00.000Z");
  assert.equal(nextReportRun("23:59", now), "2026-09-29T04:59:00.000Z");
});
test("valida destinatarios, hora y pertenencia al clúster", () => {
  const input = { nombre: "Registro 2", asunto: "Asistencia", hora: "08:30", activo: true, tienda_id: 8, destinatarios: ["Uno@gmail.com", "uno@gmail.com"] };
  assert.deepEqual(validateSchedule(input, [{ id: 8 }]).destinatarios, ["uno@gmail.com"]);
  assert.throws(() => validateSchedule(input, [{ id: 9 }]), /clúster/);
  assert.throws(() => validateSchedule({ ...input, hora: "25:00" }, [{ id: 8 }]));
  assert.throws(() => validateSchedule({ ...input, destinatarios: [] }, [{ id: 8 }]));
  assert.throws(() => validateSchedule({ ...input, destinatarios: ["correo inválido"] }, [{ id: 8 }]));
});

const roster = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, nombres: `Persona ${index + 1}`, apellidos: "Prueba", tienda_id: 8 }));
const marks = [{ usuario_id: 1, estado: "presente" }, { usuario_id: 2, estado: "tardanza" }, { usuario_id: 3, estado: "medio_turno" }, { usuario_id: 4, estado: "falta" }, { usuario_id: 5, estado: "permiso" }];
test("cuenta seis personas y distingue faltas, permisos y ausencia de registro", () => {
  const result = reportSummary(roster, marks, [{ id: 8, nombre: "Plaza Unión" }]);
  assert.deepEqual([result.total, result.asistentes, result.faltas, result.sin_registro, result.otros], [6, 3, 1, 1, 1]);
  const csv = attendanceCsv([{ nombre: '=HYPERLINK("x")', tienda: "Plaza Unión", estado: "sin_registro" }]);
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes("sin registro"));
});
test("el correo agrupa por tienda y escapa nombres ingresados por usuarios", () => {
  const stores = [{ id: 8, nombre: "Plaza <Unión>" }, { id: 9, nombre: "Centro" }];
  const summary = reportSummary([{ id: 1, nombres: "Ana &", apellidos: "Luz", tienda_id: 8 }], [{ usuario_id: 1, estado: "tardanza" }], stores);
  const html = attendanceReportHtml(summary, stores, "2026-10-01");
  assert.match(html, /Plaza &lt;Unión&gt;/);
  assert.match(html, /Ana &amp; Luz/);
  assert.match(html, /Centro/);
  assert.match(html, /Tardanza/);
  assert.match(html, /colspan="2"/);
  assert.doesNotMatch(html, /width="20%"/);
  assert.doesNotMatch(html, /Plaza <Unión>/);
});

function mockDb({ stores = [{ id: 8, nombre: "Plaza Unión" }], duplicate = false } = {}) {
  const writes = [];
  return { writes, from(table) {
    let action = "read", values;
    const resolve = mode => {
      if (action !== "read") {
        writes.push({ table, action, values });
        if (table === "envios_asistencia_zonal" && action === "insert" && duplicate) return { error: { code: "23505" } };
        return { data: action === "insert" ? { id: 101, ...values } : [], error: null };
      }
      if (table === "usuarios") return { data: mode === "single" ? { id: 5 } : roster, error: null };
      if (table === "clusters") return { data: { id: 2 }, error: null };
      if (table === "tiendas") return { data: stores, error: null };
      if (table === "asistencias") return { data: marks, error: null };
      throw new Error(`Consulta inesperada: ${table}`);
    };
    const chain = { select() { return this; }, eq() { return this; }, in() { return this; }, lte() { return this; }, or() { return this; }, order() { return this; }, insert(input) { action = "insert"; values = input; return this; }, update(input) { action = "update"; values = input; return this; }, single() { return Promise.resolve(resolve("single")); }, maybeSingle() { return Promise.resolve(resolve("single")); }, range() { return Promise.resolve(resolve("array")); }, then(yes, no) { return Promise.resolve(resolve("array")).then(yes, no); } };
    return chain;
  } };
}
const schedule = { id: 4, usuario_id: 5, nombre: "Registro 2", asunto: "Reporte de asistencia", tienda_id: 8, destinatarios: ["uno@gmail.com"] };
test("envío manual adjunta CSV y no altera el próximo envío", async () => {
  const db = mockDb(); let email;
  const result = await sendScheduledReport(db, schedule, limaDate(), "manual", async (...args) => { email = args; });
  assert.equal(result.estado, "enviado");
  assert.equal(email[3][0].filename, `asistencia-${limaDate()}.csv`);
  assert.match(email[2], /Total: 6/);
  assert.match(email[4], /Reporte diario de asistencia/);
  assert.match(email[4], /Sin registro/);
  assert.match(email[4], /Persona 1 Prueba/);
  assert.match(email[4], /<h2[^>]*>Detalle de asistencia<\/h2>[\s\S]*<table[^>]*>[\s\S]*Persona 1 Prueba/);
  const final = db.writes.find(row => row.values.estado === "enviado");
  assert.deepEqual([final.values.asistentes, final.values.faltas, final.values.sin_registro], [3, 1, 1]);
  assert.ok(db.writes.filter(row => row.table === "programaciones_asistencia_zonal").every(row => !('proximo_envio' in row.values)));
});
test("un clúster modificado impide enviar datos fuera de alcance", async () => {
  const db = mockDb({ stores: [{ id: 9, nombre: "Otra tienda" }] }); let sent = false;
  const result = await sendScheduledReport(db, schedule, limaDate(), "manual", async () => { sent = true; });
  assert.equal(sent, false);
  assert.equal(result.estado, "error");
  assert.match(result.detalle, /clúster/);
  assert.equal(db.writes.at(-1).values.estado, "error");
});
test("un fallo de Gmail queda en historial y no se marca como enviado", async () => {
  const db = mockDb();
  const result = await sendScheduledReport(db, schedule, limaDate(), "manual", async () => { throw Object.assign(new Error("SMTP error"), { code: "EAUTH" }); });
  assert.equal(result.estado, "error");
  assert.ok(!db.writes.some(row => row.values.estado === "enviado"));
  assert.match(result.detalle, /Gmail/);
});
test("la reserva única automática impide repetir un reporte del mismo día", async () => {
  const db = mockDb({ duplicate: true }); let sent = false;
  const result = await sendScheduledReport(db, schedule, limaDate(), "automatico", async () => { sent = true; });
  assert.equal(result.estado, "duplicado");
  assert.equal(sent, false);
});
