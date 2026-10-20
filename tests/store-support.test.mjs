import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import { administratorStores, resolveAdministratorContext, saveStoreSupport, storeSupportCatalog } from "../netlify/lib/store-support.js";
import { memoryPostgrest, supportFixture } from "./helpers/store-support-db.mjs";

process.env.SUPABASE_URL = "https://store-support.invalid";
process.env.SUPABASE_SECRET_KEY = "test-only-service-key";
process.env.JWT_SECRET = "store-support-tests-only";
const { handler } = await import("../netlify/functions/api.js");
const manager = { id: 1, rol: "jefe_zonal" };
const admin = { id: 2, rol: "jefe_tienda", estado: "activo", tienda_id: 10 };
const zone = async () => [10, 20];
function setup() {
  const data = supportFixture();
  const fetch = memoryPostgrest(data);
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { global: { fetch }, auth: { persistSession: false } });
  return { data, db, fetch };
}

test("an assignment persists, cannot be duplicated, and can be disabled and re-enabled", async () => {
  const { db, data } = setup();
  const row = await saveStoreSupport(db, manager, { usuario_id: 2, tienda_id: 20, habilitado: true }, zone);
  assert.equal(row.creado_por, 1);
  assert.equal(data.usuarios.find(person => person.id === 2).tienda_id, 10);
  await assert.rejects(saveStoreSupport(db, manager, { usuario_id: 2, tienda_id: 20, habilitado: true }, zone), { status: 409 });
  assert.deepEqual((await administratorStores(db, admin)).map(store => store.id), [10, 20]);
  await saveStoreSupport(db, manager, { habilitado: false }, zone, row.id);
  const catalog = await storeSupportCatalog(db, manager, zone);
  assert.equal(catalog.asignaciones.length, 1);
  assert.equal(catalog.asignaciones[0].habilitado, false);
  assert.deepEqual((await administratorStores(db, admin)).map(store => store.id), [10]);
  await saveStoreSupport(db, manager, { habilitado: true }, zone, row.id);
  assert.deepEqual((await administratorStores(db, admin)).map(store => store.id), [10, 20]);
});

test("rejects own-store grants, other roles, inactive accounts, and either end outside the manager's zone", async () => {
  const { db, data } = setup();
  const grant = (input, actor = manager) => saveStoreSupport(db, actor, { habilitado: true, ...input }, zone);
  await assert.rejects(grant({ usuario_id: 2, tienda_id: 10 }), /distinta/);
  await assert.rejects(grant({ usuario_id: 2, tienda_id: 30 }), { status: 403 });
  await assert.rejects(grant({ usuario_id: 4, tienda_id: 20 }), { status: 403 });
  await assert.rejects(grant({ usuario_id: 5, tienda_id: 20 }), { status: 403 });
  await assert.rejects(grant({ usuario_id: 2, tienda_id: 20 }, admin), { status: 403 });
  data.usuarios[1].estado = "inactivo";
  await assert.rejects(grant({ usuario_id: 2, tienda_id: 20 }), /activo/);
  data.usuarios[1].estado = "activo"; data.tiendas[1].estado = "inactivo";
  await assert.rejects(grant({ usuario_id: 2, tienda_id: 20 }), /activa/);
  assert.equal(data.apoyos_administradores_tienda.length, 0);
});

test("an old support session loses access immediately, with fallback only for session refresh", async () => {
  const { db, data } = setup();
  const grant = await saveStoreSupport(db, manager, { usuario_id: 2, tienda_id: 20, habilitado: true }, zone);
  const session = { ...admin, tienda_contexto_id: 20 };
  const context = await resolveAdministratorContext(db, session);
  assert.equal(context.tienda_id, 20); assert.equal(context.tienda_principal_id, 10);
  await assert.rejects(resolveAdministratorContext(db, session, { expectedStore: 10 }), { code: "STORE_CONTEXT_CHANGED" });
  await saveStoreSupport(db, manager, { habilitado: false }, zone, grant.id);
  await assert.rejects(resolveAdministratorContext(db, session), { code: "STORE_ACCESS_REVOKED" });
  const fallback = await resolveAdministratorContext(db, session, { allowFallback: true });
  assert.equal(fallback.tienda_id, 10); assert.equal(fallback.apoyo_revocado, true);
  assert.deepEqual(fallback.tiendas_disponibles.map(store => store.id), [10]);
  data.usuarios[1].estado = "inactivo";
  await assert.rejects(resolveAdministratorContext(db, session, { allowFallback: true }), { status: 401 });
});

test("catalog excludes grants belonging to another zone and validates the stored assignment on toggle", async () => {
  const { db, data } = setup();
  data.apoyos_administradores_tienda.push({ id: 1, usuario_id: 4, tienda_id: 20, habilitado: true }, { id: 2, usuario_id: 2, tienda_id: 30, habilitado: true });
  assert.deepEqual((await storeSupportCatalog(db, manager, zone)).asignaciones, []);
  await assert.rejects(saveStoreSupport(db, manager, { habilitado: false, usuario_id: 2 }, zone, 1), { status: 403 });
  await assert.rejects(saveStoreSupport(db, manager, { habilitado: false, tienda_id: 20 }, zone, 2), { status: 403 });
  assert.ok(data.apoyos_administradores_tienda.every(row => row.habilitado));
});

test("HTTP session selector scopes reads, writes and commercial access; disabling blocks the existing cookie", async () => {
  const { data, fetch } = setup();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fetch;
  const token = claims => jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: "5m" });
  const request = (path, claims, method = "GET", body, headers = {}) => {
    const session = typeof claims === "string" ? jwt.decode(claims) : claims;
    const url = new URL(`/api${path}`, "https://test.invalid");
    return handler({
      path: url.pathname, httpMethod: method, headers: {
        authorization: `Bearer ${typeof claims === "string" ? claims : token(claims)}`,
        ...(session.tienda_contexto_id ? { "x-store-context": String(session.tienda_contexto_id) } : {}), ...headers,
      },
      queryStringParameters: Object.fromEntries(url.searchParams), body: body ? JSON.stringify(body) : null,
    });
  };
  try {
    assert.equal((await request("/zonal/apoyos-tienda", admin)).statusCode, 403);
    assert.equal((await request("/auth/tienda", manager, "POST", { tienda_id: 20 })).statusCode, 403);
    assert.equal((await request("/auth/tienda", admin, "POST", { tienda_id: 30 })).statusCode, 403);
    const assignment = await request("/zonal/apoyos-tienda", manager, "POST", { usuario_id: 2, tienda_id: 20, habilitado: true });
    assert.equal(assignment.statusCode, 201, assignment.body);
    const selection = await request("/auth/tienda", admin, "POST", { tienda_id: 20 });
    assert.equal(selection.statusCode, 200, selection.body);
    const selectedToken = selection.headers["Set-Cookie"].match(/asiste_session=([^;]+)/)[1];
    assert.equal(JSON.parse(selection.body).user.tienda_id, 20);
    assert.equal(JSON.parse(selection.body).user.tienda_principal_id, 10);
    assert.equal((await request("/usuarios", selectedToken, "GET", null, { "x-store-context": "" })).statusCode, 409, "An old client without a store context must refresh before using a switched cookie");
    assert.equal((await request("/reportes/personal?tienda_id=10", selectedToken)).statusCode, 403, "A report cannot override the active support store");
    const users = await request("/usuarios", selectedToken);
    assert.equal(users.statusCode, 200, users.body);
    assert.deepEqual(JSON.parse(users.body).map(person => person.id), [6]);
    const profile = await request("/perfil", selectedToken);
    assert.equal(JSON.parse(profile.body).tienda_nombre, "MARISCAL");
    const commercial = await request("/commercial/access", selectedToken);
    assert.equal(commercial.statusCode, 200, commercial.body);
    assert.deepEqual(JSON.parse(commercial.body).access.storeIds, ["T020"]);
    const edit = await request("/mi-tienda-gestion/datos", selectedToken, "PUT", { direccion: "Nueva dirección de apoyo" }, { "x-store-context": "20" });
    assert.equal(edit.statusCode, 200, edit.body);
    assert.equal(data.tiendas[0].direccion, "Dirección principal");
    assert.equal(data.tiendas[1].direccion, "Nueva dirección de apoyo");
    assert.equal(data.usuarios.find(person => person.id === 2).tienda_id, 10, "Switching and editing never reassign the administrator's primary store");
    const staleTab = await request("/mi-tienda-gestion/datos", selectedToken, "PUT", { direccion: "NO CAMBIAR" }, { "x-store-context": "10" });
    assert.equal(staleTab.statusCode, 409);
    assert.equal(data.tiendas[1].direccion, "Nueva dirección de apoyo");
    const id = JSON.parse(assignment.body).id;
    assert.equal((await request(`/zonal/apoyos-tienda/${id}`, manager, "PATCH", { habilitado: false })).statusCode, 200);
    assert.equal((await request("/commercial/access", selectedToken)).statusCode, 403);
    assert.equal((await request("/mi-tienda-gestion/datos", selectedToken, "PUT", { direccion: "NO CAMBIAR" })).statusCode, 403);
    const refreshed = await request("/auth/me", selectedToken);
    assert.equal(refreshed.statusCode, 200, refreshed.body);
    assert.equal(JSON.parse(refreshed.body).user.tienda_id, 10);
    assert.equal(JSON.parse(refreshed.body).user.tiendas_disponibles.length, 1);
    assert.ok(refreshed.headers["Set-Cookie"]);
  } finally { globalThis.fetch = previousFetch; }
});

test("credential changes preserve the selected support store and refreshes retain credential validation", async () => {
  const { data, fetch } = setup();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fetch;
  const account = data.usuarios.find(person => person.id === 2);
  account.usuario = "alf";
  account.credenciales_actualizadas_en = "2026-10-20T10:00:00.000Z";
  account.cambio_credenciales_pendiente = false;
  data.apoyos_administradores_tienda.push({ id: 1, usuario_id: 2, tienda_id: 20, habilitado: true });
  const invoke = (path, token, method = "GET", body) => handler({
    path: `/api${path}`, httpMethod: method,
    headers: { ...(token ? { authorization: `Bearer ${token}`, "x-store-context": String(jwt.decode(token).tienda_contexto_id || 10) } : {}) },
    queryStringParameters: {}, body: body ? JSON.stringify(body) : null,
  });
  const cookieToken = response => response.headers["Set-Cookie"].match(/asiste_session=([^;]+)/)[1];
  try {
    const login = await invoke("/auth/login", null, "POST", { usuario: "alf", password: "test-only" });
    assert.equal(login.statusCode, 200, login.body);
    const selected = await invoke("/auth/tienda", cookieToken(login), "POST", { tienda_id: 20 });
    assert.equal(selected.statusCode, 200, selected.body);
    const selectedToken = cookieToken(selected);
    assert.equal(jwt.decode(selectedToken).credenciales_actualizadas_en, account.credenciales_actualizadas_en);
    const refresh = await invoke("/auth/me", selectedToken);
    assert.equal(refresh.statusCode, 200, refresh.body);
    assert.equal(JSON.parse(refresh.body).user.tienda_id, 20);
    assert.equal(refresh.headers["Set-Cookie"], undefined, "A routine refresh cannot overwrite another tab's newer store cookie");
    account.cambio_credenciales_pendiente = true;
    const pending = await invoke("/auth/me", selectedToken);
    assert.equal(pending.statusCode, 200, pending.body);
    assert.equal(JSON.parse(pending.body).user.cambio_credenciales_pendiente, true);
    const pendingToken = cookieToken(pending);
    assert.equal((await invoke("/auth/tienda", pendingToken, "POST", { tienda_id: 10 })).statusCode, 403);
    const changed = await invoke("/auth/change-credentials", pendingToken, "POST", { usuario: "ana.nueva", password: "NuevaClave123!", confirmarPassword: "NuevaClave123!" });
    assert.equal(changed.statusCode, 200, changed.body);
    assert.equal(JSON.parse(changed.body).user.tienda_id, 20);
    assert.equal(JSON.parse(changed.body).user.tienda_principal_id, 10);
    assert.equal(jwt.decode(cookieToken(changed)).cambio_credenciales_pendiente, false);
    assert.equal((await invoke("/auth/me", selectedToken)).statusCode, 401, "The old credential epoch remains invalid after changing stores");
    assert.equal((await invoke("/auth/me", cookieToken(changed))).statusCode, 200);
  } finally { globalThis.fetch = previousFetch; }
});
