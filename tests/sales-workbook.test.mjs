import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { buildSalesWorkbook } from "../src/lib/salesWorkbook.js";
import { parseAnnualFilters } from "../shared/annualReports.js";

const options = { filters: parseAnnualFilters({ year: "2026", month: "9", storeId: "T012" }),
  stores: [{ id: "T012", name: "AYACUCHO" }], cutoff: "2026-09-30" };
const sale = { fecha: "2026-09-27", anio: 2026, mes: 9, dia: 27, tienda_id: "T012", tienda: "AYACUCHO",
  nro_venta: "000012345678901234", codigo_nissei: "000123", descripcion: "=2+2",
  rubro: "CALZADO", linea: "CALZADO DAMA", sub_linea: "ZAPATILLAS", marca: "MARCA",
  cantidad: "2", precio_real: "59.9", total_venta: "119.8", tipo_documento: "BOLETA", estado: "VENDIDO" };

test("el Excel conserva fechas, códigos, textos y números al reabrirlo y reconcilia devoluciones", async () => {
  const { workbook, count } = await buildSalesWorkbook([sale, { ...sale, cantidad: -1, total_venta: -59.9 }], options);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = reopened.getWorksheet("Ventas");
  assert.equal(count, 2);
  assert.equal(sheet.getCell("A9").value.toISOString().slice(0, 10), sale.fecha);
  assert.equal(sheet.getCell("G9").value, sale.nro_venta);
  assert.equal(sheet.getCell("H9").value, "000123");
  assert.equal(sheet.getCell("I9").value, "=2+2");
  assert.equal(sheet.getCell("I9").formula, undefined);
  assert.equal(sheet.getCell("P9").value, 119.8);
  assert.equal(sheet.getCell("G5").formula, "SUBTOTAL(109,P9:P10)");
  assert.equal(sheet.getCell("G5").result, 59.9);
  assert.equal(sheet.getCell("G6").result, 1);
  assert.equal(sheet.getCell("J5").result, 2);
  assert.match(sheet.getCell("A3").value, /se(?:p)?tiembre.*AYACUCHO/i);
  assert.equal(sheet.views[0].ySplit, 8);
  assert.equal(sheet.autoFilter, "A8:R10");
});

test("no transforma importes ausentes en ventas cero ni crea un archivo sin resultados", async () => {
  const { workbook } = await buildSalesWorkbook([{ ...sale, cantidad: "", total_venta: null }], options);
  const sheet = workbook.getWorksheet("Ventas");
  assert.equal(sheet.getCell("P9").value, null);
  assert.equal(sheet.getCell("G5").value, "No disponible");
  assert.equal(sheet.getCell("G6").value, "No disponible");
  await assert.rejects(buildSalesWorkbook([], options), /No hay registros/);
});
