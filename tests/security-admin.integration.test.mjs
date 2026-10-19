import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";

const site = process.env.PORTAL_SITE_URL?.replace(/\/$/, "");
const secret = process.env.JWT_SECRET;

test("Seguridad central consulta y exporta sin abrir acceso a Seguridad de tienda", { skip: !site || !secret }, async () => {
  // Sesión de diagnóstico local: no crea una cuenta ni cambia registros.
  const globalToken = jwt.sign({ id: 0, usuario: "auditoria-local", rol: "administrador_seguridad", tienda_id: null, estado: "activo" }, secret, { expiresIn: "5m" });
  const storeToken = jwt.sign({ id: 0, usuario: "auditoria-tienda", rol: "seguridad", tienda_id: 1, estado: "activo" }, secret, { expiresIn: "5m" });
  const period = "tipo=todo&desde=2026-10-15&hasta=2026-10-15";
  const read = await fetch(`${site}/api/seguridad-central?${period}`, { headers: { Authorization: `Bearer ${globalToken}` } });
  assert.equal(read.status, 200, "el administrador global puede consultar");
  const report = await read.json();
  assert.ok(Array.isArray(report.rows));
  assert.ok(Array.isArray(report.stores));
  assert.ok(report.rows.every(row => ["Tráfico", "Incidencia"].includes(row.tipo_registro)));

  const exportResponse = await fetch(`${site}/api/seguridad-central?${period}&export=1`, { headers: { Authorization: `Bearer ${globalToken}` } });
  assert.equal(exportResponse.status, 200, "el administrador global puede exportar");
  assert.match(exportResponse.headers.get("content-type") || "", /text\/csv/);
  assert.match(await exportResponse.text(), /Tipo de registro,Fecha,Tienda/);

  const denied = await fetch(`${site}/api/seguridad-central?${period}`, { headers: { Authorization: `Bearer ${storeToken}` } });
  assert.equal(denied.status, 403, "Seguridad de tienda no accede al consolidado");
});
