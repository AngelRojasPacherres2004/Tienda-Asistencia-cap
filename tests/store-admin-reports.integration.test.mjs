import assert from "node:assert/strict";
import test from "node:test";

const site = process.env.PORTAL_SITE_URL?.replace(/\/$/, "");
const password = process.env.PORTAL_INITIAL_PASSWORD;

test("Administrador de tienda ve y exporta solo su personal", { skip: !site || !password }, async () => {
  const login = await fetch(`${site}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: "AYA", password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const { user } = await login.json();
  assert.equal(user.rol, "jefe_tienda");

  const report = await fetch(`${site}/api/reportes/personal`, { headers: { Cookie: cookie } });
  assert.equal(report.status, 200);
  const { rows } = await report.json();
  assert.ok(Array.isArray(rows) && rows.length > 0);
  assert.ok(rows.every(row => row.tienda === user.tienda_nombre));

  const overview = await fetch(`${site}/api/operaciones/resumen`, { headers: { Cookie: cookie } });
  assert.equal(overview.status, 200);
  const indicators = await overview.json();
  assert.equal(indicators.incidencias_seguridad + indicators.incidencias_administrativas, indicators.incidencias);

  const denied = await fetch(`${site}/api/reportes/personal?tienda_id=999999`, { headers: { Cookie: cookie } });
  assert.equal(denied.status, 403);

  const exportResponse = await fetch(`${site}/api/reportes/personal/export.xlsx`, { headers: { Cookie: cookie } });
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get("content-type") || "", /spreadsheetml/);
  const file = new Uint8Array(await exportResponse.arrayBuffer());
  assert.equal(String.fromCharCode(...file.slice(0, 2)), "PK");
});
