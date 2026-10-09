import test from "node:test";
import assert from "node:assert/strict";
import { businessDate, addDays, countWorkdays, attendanceCounts, courseProgress, trafficPeak, rotationCounts, employmentPeriods, pendingAttendance, NORMAL_TRAFFIC_HOURS } from "../shared/metrics.js";

test("Lima conserva el día operativo después de medianoche UTC", () => {
  assert.equal(businessDate("2026-10-06T04:59:59Z"), "2026-10-05");
  assert.equal(businessDate("2026-10-06T05:00:00Z"), "2026-10-06");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});
test("los ocho estados se contabilizan sin tratar permisos como faltas", () => {
  const counts = attendanceCounts(["presente", "tardanza", "medio_turno", "apoyo", "falta", "permiso", "descanso_medico", "suspension"].map(estado => ({ estado })));
  assert.deepEqual(counts, { presente: 3, tardanza: 1, ausencia: 1, otros: 3, total: 8 });
});
test("el pico de tráfico funciona aunque falte el primer horario y conserva cero registrado", () => {
  assert.equal(trafficPeak(new Map([["12:00-13:00", 35], ["14:00-15:00", 82]])), "14:00-15:00");
  assert.equal(trafficPeak(new Map([["09:00-10:00", 0]])), "09:00-10:00");
  assert.equal(trafficPeak(new Map()), null);
  assert.equal(NORMAL_TRAFFIC_HOURS.length, 13);
});
test("los pendientes de cursos solo incluyen roles asignados y todas las capacitaciones", () => {
  const courses = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, nombre: `Curso ${index + 1}`, curso_roles: [{ rol_codigo: "seguridad" }] }));
  const people = [{ id: 1, rol: "seguridad" }, { id: 2, rol: "vendedor" }];
  const progress = [{ curso_id: 1, usuario_id: 1, estado: "completado" }, { curso_id: 1, usuario_id: 2, estado: "completado" }];
  const result = courseProgress(courses, people, progress);
  assert.equal(result.length, 8);
  assert.equal(result.reduce((sum, row) => sum + row.pendientes, 0), 7);
  assert.equal(result.find(row => row.curso_id === 1).completados, 1);
});
test("rotación respeta entradas el día 1, salidas al cierre y reingresos", () => {
  const periods = [{ fecha_ingreso: "2026-09-01", fecha_salida: "2026-09-30" }, { fecha_ingreso: "2026-08-01", fecha_salida: null }];
  const counts = rotationCounts(periods, "2026-09-01", "2026-09-30");
  assert.deepEqual(counts, { ingreso: 1, salida: 1, personal_inicio: 1, personal_fin: 1 });
  assert.equal(counts.personal_inicio + counts.ingreso - counts.salida, counts.personal_fin);
  assert.equal(employmentPeriods({ fecha_ingreso: "2026-10-01", fecha_salida: null, periodos_laborales: periods }).length, 3);
});
test("pendientes excluye días fuera del vínculo y no duplica períodos superpuestos", () => {
  const people = [{ id: 1, fecha_ingreso: "2026-10-02", fecha_salida: "2026-10-03", periodos_laborales: [{ fecha_ingreso: "2026-10-02", fecha_salida: "2026-10-03" }] }];
  assert.equal(pendingAttendance(people, [{ usuario_id: 1, fecha: "2026-10-02" }], "2026-10-01", "2026-10-05"), 1);
});

test("la semana laboral va de lunes a sábado y excluye domingos pendientes", () => {
  assert.equal(countWorkdays("2026-10-05", "2026-10-11"), 6);
  assert.equal(pendingAttendance([{ id: 1, fecha_ingreso: "2026-10-05", fecha_salida: null }], [], "2026-10-05", "2026-10-11"), 6);
});
