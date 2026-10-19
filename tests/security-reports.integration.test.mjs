import assert from "node:assert/strict";
import test from "node:test";

const site = process.env.PORTAL_SITE_URL?.replace(/\/$/, "");
const password = process.env.PORTAL_INITIAL_PASSWORD;

test("Seguridad de tienda descarga tráfico e incidencias del mes sin ver Personal", { skip: !site || !password }, async () => {
  const login = await fetch(`${site}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: "seguridadAYA", password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);

  for (const kind of ["trafico", "incidencias"]) {
    const response = await fetch(`${site}/api/${kind}/export.xlsx?desde=2026-10-01&hasta=2026-10-18`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200, `${kind}: descarga disponible`);
    assert.match(response.headers.get("content-type") || "", /spreadsheetml/);
    const file = new Uint8Array(await response.arrayBuffer());
    assert.equal(String.fromCharCode(...file.slice(0, 2)), "PK");
  }

  const personnel = await fetch(`${site}/api/reportes/personal`, { headers: { Cookie: cookie } });
  assert.equal(personnel.status, 403);
});
