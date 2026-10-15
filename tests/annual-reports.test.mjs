import test from "node:test";
import assert from "node:assert/strict";
import { ANNUAL_DETAIL_COLUMNS, annualReportPath, annualMonthlyReportPath, annualMonthlySummaryPath, parseAnnualFilters, matchesAnnualRow, csvLine } from "../shared/annualReports.js";
import { summarizeAnnualReports, buildAnnualSummaryWorkbook } from "../netlify/lib/annual-report-workbook.js";

const version = "20261009T163742Z-18015098d4a3";

test("un reporte detallado exige un solo año y rutas sin desbordar alcance", () => {
  assert.deepEqual(parseAnnualFilters({ year: "2026", month: "9", day: "30" }).year, 2026);
  assert.throws(() => parseAnnualFilters({ year: "2025,2026" }), /único año/);
  assert.throws(() => parseAnnualFilters({ year: "2026", day: "1" }), /Día/);
  assert.throws(() => parseAnnualFilters({ year: "2026", month: "2", day: "30" }), /Día/);
  assert.equal(annualReportPath(version, 2026, "ventas", "T012"),
    `commercial-annual/${version}/2026/ventas/T012.jsonl.gz`);
  assert.throws(() => annualReportPath(version, 2026, "ventas", "../T012"));
  assert.equal(annualMonthlyReportPath(version, 2026, "ventas", "T012", 9),
    `commercial-annual-v2/${version}/2026/ventas/T012/09.jsonl.gz`);
  assert.equal(annualMonthlySummaryPath(version, 2026, "T012"),
    `commercial-annual-v2/${version}/2026/summary/T012.json.gz`);
  assert.throws(() => annualMonthlyReportPath(version, 2026, "ventas", "T012", 13));
});

test("el detalle separa fecha, tienda y producto y evita fórmulas CSV", () => {
  const row = { fecha: "2026-09-27", anio: 2026, mes: 9, dia: 27,
    tienda_id: "T012", rubro: "TEXTIL", linea: "ROPA DAMA", sub_linea: "BLUSAS", descripcion: "=2+2" };
  assert.ok(ANNUAL_DETAIL_COLUMNS.ventas.includes("dia"));
  assert.ok(ANNUAL_DETAIL_COLUMNS.ventas.includes("descripcion"));
  assert.equal(matchesAnnualRow(row, parseAnnualFilters({ year: "2026", month: "9", gender: "DAMA" }), "ventas"), true);
  assert.equal(matchesAnnualRow(row, parseAnnualFilters({ year: "2026", month: "8" }), "ventas"), false);
  assert.equal(matchesAnnualRow(row, parseAnnualFilters({ year: "2026" }), "ventas", "2026-09-26"), false);
  assert.equal(csvLine(row, ["descripcion"]).trim(), "'=2+2");
});

test("resumen no suma stock entre fotos ni inventa conversión con filtro de producto", async () => {
  const filters = parseAnnualFilters({ year: "2026", rubro: "TEXTIL" });
  const storeRows = [{ storeId: "T012", rows: [
    { kind: "ventas", fecha: "2026-09-27", anio: 2026, mes: 9, dia: 27, tienda_id: "T012", rubro: "TEXTIL", venta_neta: 120, unidades: 2 },
    { kind: "ventas_diario", fecha: "2026-09-27", anio: 2026, mes: 9, dia: 27, tienda_id: "T012", venta_neta: 150, transacciones: 3 },
    { kind: "trafico", fecha: "2026-09-27", anio: 2026, mes: 9, dia: 27, tienda_id: "T012", personas: 10 },
    { kind: "stock", fecha: "2026-06-30", anio: 2026, mes: 6, dia: 30, tienda_id: "T012", rubro: "TEXTIL", unidades: 10, valor_stock: 100 },
    { kind: "stock", fecha: "2026-07-31", anio: 2026, mes: 7, dia: 31, tienda_id: "T012", rubro: "TEXTIL", estado_stock: "BUENO", unidades: 6, valor_stock: 60 },
    { kind: "stock", fecha: "2026-07-31", anio: 2026, mes: 7, dia: 31, tienda_id: "T012", rubro: "TEXTIL", estado_stock: "MERMA", unidades: 2, valor_stock: 20 },
    { kind: "stock", fecha: "2026-08-31", anio: 2026, mes: 8, dia: 31, tienda_id: "T012", rubro: "TEXTIL", unidades: 100, valor_stock: 1000 },
  ] }];
  const cutoffs = { ventas: "2026-09-27", trafico: "2026-09-27", stock: "2026-07-31" };
  const summary = summarizeAnnualReports(storeRows, filters, { T012: { name: "AYACUCHO" } }, cutoffs);
  assert.equal(summary.totals.venta_neta, 120);
  assert.equal(summary.totals.transacciones, 0);
  assert.equal(summary.stock.unidades, 8);
  assert.deepEqual(summary.stockStores.map(row => [row.estado, row.unidades]), [["BUENO", 6], ["MERMA", 2]]);
  assert.deepEqual(summary.stockDates, ["2026-07-31"]);
  const september = summarizeAnnualReports(storeRows,
    parseAnnualFilters({ year: "2026", month: "9", rubro: "TEXTIL" }),
    { T012: { name: "AYACUCHO" } }, cutoffs);
  assert.equal(september.stock.unidades, 8); // Última foto conocida antes de septiembre.
  const workbook = buildAnnualSummaryWorkbook(summary, filters, { T012: { name: "AYACUCHO" } });
  assert.equal(workbook.worksheets.length, 3);
  assert.equal(workbook.getWorksheet("Resumen").getCell("B8").value, "No disponible");
  assert.equal(workbook.getWorksheet("Resumen").getCell("C5").value, null);
  assert.equal(workbook.getWorksheet("Diario por tienda").getCell("F2").value, "AYACUCHO");
  assert.equal(workbook.getWorksheet("Stock por tienda").getCell("D2").value, "BUENO");
  assert.equal(workbook.getWorksheet("Stock por tienda").getCell("D3").value, "MERMA");
});
