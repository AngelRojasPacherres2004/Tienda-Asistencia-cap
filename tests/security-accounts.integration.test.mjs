import assert from "node:assert/strict";
import test from "node:test";
import { portalStores } from "../scripts/portal-store-catalog.mjs";

const site = process.env.PORTAL_SITE_URL?.replace(/\/$/, "");
const password = process.env.PORTAL_INITIAL_PASSWORD;

test("cada Seguridad accede solo a sus módulos y tienda", { skip: !site || !password }, async () => {
  const accounts = [];
  for (const [, storeName, alias] of portalStores) {
    // El ingreso acepta la forma seguridadAYA solicitada, aunque la cuenta
    // se almacene en minúsculas para conservar la búsqueda normalizada.
    const username = `seguridad${alias.toUpperCase()}`;
    const login = await fetch(`${site}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: username, password }),
    });
    assert.equal(login.status, 200, `${username}: inicio de sesión`);
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie, `${username}: sesión`);
    const { user } = await login.json();
    assert.equal(user.rol, "seguridad", `${username}: rol`);
    assert.equal(user.tienda_nombre, storeName, `${username}: tienda`);
    assert.ok(Number.isInteger(Number(user.tienda_id)), `${username}: tienda asignada`);
    accounts.push({ username, storeId: Number(user.tienda_id), cookie });
  }

  assert.equal(new Set(accounts.map(({ storeId }) => storeId)).size, portalStores.length);
  for (const [index, account] of accounts.entries()) {
    const headers = { Cookie: account.cookie };
    const otherStore = accounts[(index + 1) % accounts.length].storeId;
    for (const endpoint of ["/api/trafico", "/api/incidencias"]) {
      const response = await fetch(`${site}${endpoint}`, { headers });
      assert.equal(response.status, 200, `${account.username}: ${endpoint}`);
      const rows = await response.json();
      assert.ok(Array.isArray(rows), `${account.username}: ${endpoint} devuelve filas`);
      assert.ok(rows.every((row) => Number(row.tienda_id) === account.storeId),
        `${account.username}: ${endpoint} solo muestra su tienda`);
      const forbidden = await fetch(`${site}${endpoint}?tienda_id=${otherStore}`, { headers });
      assert.equal(forbidden.status, 403, `${account.username}: ${endpoint} no permite otra tienda`);
    }
    for (const endpoint of ["/api/dashboard", "/api/commercial/access", "/api/commercial/manifest", "/api/commercial/files/dashboard.json"]) {
      const response = await fetch(`${site}${endpoint}`, { headers });
      assert.equal(response.status, 403, `${account.username}: ${endpoint} restringido`);
    }
  }
});
