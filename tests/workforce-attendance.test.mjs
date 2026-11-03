import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkforceDomain } from '../netlify/domains/workforce.js';
import { ATTENDANCE_OPTIONS } from '../shared/attendance.js';

function fixture() {
  const worker = { id: 1, tienda_id: 10, rol: 'vendedor', estado: 'activo', nombres: 'Ana', apellidos: 'Prueba' };
  const data = {
    usuarios: [worker], asistencias: [], log_asistencias: [],
    cobertura_trabajadores: [{ usuario_id: 1, tienda_destino_id: 20, usuarios: worker, cobertura: { estado: 'confirmada', fecha_inicio: '2026-10-28', fecha_fin: '2026-10-28' } }],
  };
  const supabase = { from(table) {
    let filters = [], action, values, conflict;
    const field = (row, key) => key.split('.').reduce((value, part) => value?.[part], row);
    const query = {
      select() { return this; }, order() { return this; },
      eq(key, value) { filters.push(row => field(row, key) === value); return this; },
      in(key, values) { filters.push(row => values.includes(field(row, key))); return this; },
      lte(key, value) { filters.push(row => field(row, key) <= value); return this; },
      gte(key, value) { filters.push(row => field(row, key) >= value); return this; },
      maybeSingle() { return Promise.resolve({ data: data[table].find(row => filters.every(filter => filter(row))) || null, error: null }); },
      upsert(input, options) { action = 'upsert'; values = input; conflict = options.onConflict.split(','); return this; },
      insert(input) { action = 'insert'; values = input; return this; },
      then(resolve, reject) {
        if (action === 'upsert') for (const row of values) {
          const existing = data[table].find(item => conflict.every(key => item[key] === row[key]));
          if (existing) Object.assign(existing, row); else data[table].push({ ...row });
        }
        if (action === 'insert') data[table].push(...values);
        return Promise.resolve({ data: data[table].filter(row => filters.every(filter => filter(row))), error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
  const domain = createWorkforceDomain({
    supabase, attendanceStaffRoles: ['vendedor', 'jefe_tienda'], asistenciaEstados: new Set(ATTENDANCE_OPTIONS.map(row => row.value)),
    bodyOf: event => event.body, requireFields() {}, isISODate: date => /^\d{4}-\d{2}-\d{2}$/.test(date),
    validIds: values => [...new Set(values.map(Number))], cleanText: value => value.trim(),
    readAllResult: query => query, httpError: (message, status) => Object.assign(new Error(message), { status }),
    dbError: error => error, todayISO: () => '2026-10-28', resolveStoreScope: user => user.tienda_id,
    applyStoreScope: (query, storeId) => query.eq('tienda_id', storeId),
  });
  const save = (storeId, estado, fecha = '2026-10-28') => domain.guardarAsistenciasLote({ body: { fecha, marcas: [{ usuario_id: 1, estado }] } }, { id: 99, tienda_id: storeId });
  return { data, domain, save };
}

test('own staff can record rest and outgoing support but never incoming support manually', async () => {
  const { data, save } = fixture();
  await save(10, 'descanso');
  await save(10, 'apoyo');
  await assert.rejects(save(20, 'apoyo_ingreso'), error => error.status === 403);
  await save(10, 'apoyo');
  assert.equal(data.asistencias.length, 1);
  assert.equal(data.asistencias[0].estado, 'apoyo');
  assert.equal(data.log_asistencias.length, 2);
});

test('automatic support rows appear selected and locked, including multiple manual workers', async () => {
  const { data, domain, save } = fixture();
  data.asistencias.push({ usuario_id: 1, tienda_id: 20, fecha: '2026-10-28', estado: 'apoyo_ingreso', cobertura_trabajador_id: 100, usuarios: data.usuarios[0] });
  data.asistencias.push({ usuario_id: null, tienda_id: 20, fecha: '2026-10-28', estado: 'apoyo_ingreso', cobertura_trabajador_id: 101, cobertura_trabajador: { nombre_manual: 'Persona externa', dni_manual: '87654321' } });
  data.asistencias.push({ usuario_id: null, tienda_id: 20, fecha: '2026-10-28', estado: 'apoyo_ingreso', cobertura_trabajador_id: 102, cobertura_trabajador: { nombre_manual: 'Otra persona' } });
  const roster = await domain.listAsistenciasDia({ queryStringParameters: { estado: 'activo' } }, { tienda_id: 20 });
  assert.equal(roster.empleados.length, 3);
  assert(roster.empleados.every(person => person.apoyo_ingreso && person.bloqueado && person.registro.estado === 'apoyo_ingreso'));
  assert.equal(new Set(roster.empleados.map(person => person.persona_id)).size, 3);
  await assert.rejects(save(30, 'apoyo_ingreso'));
  await assert.rejects(save(20, 'apoyo_ingreso', '2026-10-29'));
  data.cobertura_trabajadores[0].cobertura.estado = 'borrador';
  await assert.rejects(save(20, 'apoyo_ingreso'));
});

test('automatic incoming attendance cannot be deleted from the attendance endpoint', async () => {
  const { data, domain } = fixture();
  data.asistencias.push({ id: 100, usuario_id: null, tienda_id: 20, fecha: '2026-10-28', estado: 'apoyo_ingreso', cobertura_trabajador_id: 101 });
  await assert.rejects(domain.eliminarAsistencia(100, { tienda_id: 20 }), error => error.status === 403);
  assert.equal(data.asistencias.length, 1);
});

test('administrator is listed first in attendance and retains the role label', async () => {
  const { data, domain } = fixture();
  data.usuarios.push({ id: 2, tienda_id: 10, rol: 'jefe_tienda', estado: 'activo', nombres: 'Zoe', apellidos: 'Administradora' });
  const result = await domain.listAsistenciasDia({ queryStringParameters: { estado: 'activo' } }, { tienda_id: 10 });
  assert.deepEqual(result.empleados.map(person => person.usuario_id), [2, 1]);
  assert.equal(result.empleados[0].rol, 'jefe_tienda');
});
