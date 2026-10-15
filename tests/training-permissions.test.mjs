import test, { after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

const originalFetch = globalThis.fetch;
const originalEnv = Object.fromEntries(["SUPABASE_URL", "SUPABASE_SECRET_KEY", "JWT_SECRET"].map(key => [key, process.env[key]]));
process.env.SUPABASE_URL = "https://training-check.invalid";
process.env.SUPABASE_SECRET_KEY = "local-test-key";
process.env.JWT_SECRET = "local-training-test-secret";
const roles = ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda",
  "jefe_seguridad", "jefe_area", "seguridad", "caja", "almacenero", "vendedor", "asistente", "trabajador"];
const people = [...roles, "sistemas", "marketing", "coach"].map((rol, index) => ({ id: index + 10,
  rol, tienda_id: index < 3 ? null : 7, nombres: "Persona", apellidos: rol, usuario: rol, estado: "activo" }));
const progress = new Map();
let assigned = true;
let writes = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  assert.equal(url.hostname, "training-check.invalid", "Las pruebas no deben consultar una base real");
  let data;
  if (url.pathname.endsWith("/usuarios")) data = people.filter(person => `eq.${person.id}` === url.searchParams.get("id"));
  else if (url.pathname.endsWith("/curso_roles")) data = assigned ? [{ curso_id: 9 }] : [];
  else if (url.pathname.endsWith("/cursos")) data = [{ id: 9, nombre: "Atención al cliente", competencia: "Servicio", activo: true }];
  else if (url.pathname.endsWith("/capacitacion_progreso")) {
    if (init.method === "POST") {
      const row = JSON.parse(init.body);
      progress.set(row.usuario_id, row);
      writes++;
      return new Response(null, { status: 201 });
    }
    const id = Number(url.searchParams.get("usuario_id")?.replace("eq.", ""));
    data = progress.has(id) ? [progress.get(id)] : [];
  } else throw new Error(`Consulta inesperada: ${url.pathname}`);
  return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
};
const { handler } = await import("../netlify/functions/api.js");
after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

const request = (id, body, actor = { id: 3, rol: "coach" }) => handler({
  httpMethod: body ? "PUT" : "GET",
  path: `/api/capacitaciones/trabajadores/${id}${body ? "/cursos/9" : ""}`,
  headers: actor ? { authorization: `Bearer ${jwt.sign(actor, process.env.JWT_SECRET)}` } : {},
  body: body ? JSON.stringify(body) : null,
});

test("Coach ve lo registrado y guarda los tres estados para cada rol supervisado", async t => {
  for (const person of people.filter(person => roles.includes(person.rol))) {
    await t.test(person.rol, async () => {
      progress.set(person.id, { curso_id: 9, usuario_id: person.id, estado: "en_curso", duracion_horas: 1.5, nota: 16, resultado: "aprobado" });
      const initial = await request(person.id);
      assert.equal(initial.statusCode, 200);
      const course = JSON.parse(initial.body).cursos[0];
      assert.equal(course.estado, "en_curso");
      assert.equal(course.nota, 16);
      for (const estado of ["completado", "en_curso", "pendiente"]) {
        const response = await request(person.id, { estado, duracion_horas: 2, nota: 18, resultado: "aprobado" });
        assert.equal(response.statusCode, 200, response.body);
        const saved = JSON.parse((await request(person.id)).body).cursos[0];
        assert.equal(saved.estado, estado);
        assert.equal(saved.duracion_horas, 2);
        assert.equal(saved.nota, 18);
        assert.equal(saved.resultado, "aprobado");
        assert.equal(Boolean(saved.fecha_finalizacion), estado === "completado");
        assert.equal(progress.get(person.id).actualizado_por, 3);
        assert.equal(progress.get(person.id).tienda_id, person.tienda_id);
      }
    });
  }
});

test("se rechazan cursos sin asignar, roles fuera del alcance y valores inválidos sin guardar", async () => {
  const previousWrites = writes;
  assigned = false;
  assert.equal((await request(10, { estado: "completado" })).statusCode, 403);
  assigned = true;
  for (const person of people.filter(person => !roles.includes(person.rol)))
    assert.equal((await request(person.id, { estado: "completado" })).statusCode, 403);
  assert.equal((await request(999, { estado: "completado" })).statusCode, 404);
  assert.equal((await request(10, { estado: "inventado" })).statusCode, 400);
  assert.equal((await request(10, { estado: "completado", nota: 21 })).statusCode, 400);
  assert.equal((await request(10, { estado: "completado", resultado: "inventado" })).statusCode, 400);
  assert.equal((await request(10, { estado: "completado" }, null)).statusCode, 401);
  assert.equal((await request(10, { estado: "completado" }, { id: 4, rol: "gerente_comercial" })).statusCode, 403);
  const seller = people.find(person => person.rol === "vendedor");
  assert.equal((await request(seller.id, { estado: "completado" }, { id: 4, rol: "jefe_tienda", tienda_id: 8 })).statusCode, 403);
  assert.equal(writes, previousWrites);
});
