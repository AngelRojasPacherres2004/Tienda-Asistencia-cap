import ExcelJS from "exceljs";
import { ANNUAL_DETAIL_COLUMNS, ANNUAL_REPORT_LABELS, MAX_SALES_EXCEL_ROWS } from "../../shared/annualReports.js";

// Keep browser memory bounded; CSV remains available for larger selections.
export { MAX_SALES_EXCEL_ROWS } from "../../shared/annualReports.js";
const HEADER_ROW = 8;
const BLUE = "183F87";
const INK = "24364B";
const MONEY = '"S/ "#,##0.00;[Red]("S/ "#,##0.00);"S/ "0.00';
const NUMBERS = new Set(["anio", "mes", "dia", "cantidad", "precio_real", "total_venta"]);

function numberValue(value) {
  if (value == null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function overviewTableHeader(row, labels) {
  row.values = labels;
  row.height = 30;
  row.eachCell(cell => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BLUE}` } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
}

function fillOverview(sheet, { filters, stores, cutoff, month, count, sales, units, salesValues, unitValues, byStore, lastRow }) {
  sheet.columns = [18, 36, 18, 18, 24, 18].map(width => ({ width }));
  sheet.views = [{ showGridLines: false, zoomScale: 100, activeCell: "A1" }];
  sheet.getCell("A2").value = `Resumen de ventas ${filters.year}`;
  sheet.getCell("A2").font = { name: "Arial", size: 16, bold: true, color: { argb: `FF${BLUE}` } };
  sheet.getRow(2).height = 32;
  const context = {
    A3: "Período", B3: [month, filters.day ? `Día ${filters.day}` : ""].filter(Boolean).join(" · "),
    A4: "Tienda", B4: filters.storeId ? stores.find(store => store.id === filters.storeId)?.name || filters.storeId : "Todas las tiendas seleccionadas",
    A5: "Clasificación", B5: [filters.rubro, filters.gender, filters.linea, filters.sublinea].filter(Boolean).join(" · ") || "Todas",
    D3: "Datos al", E3: cutoff ? new Date(`${cutoff}T00:00:00Z`) : "Sin fecha de corte",
    D4: "Formato", E4: filters.format || "Todos", D5: "Clúster", E5: filters.cluster || "Todos",
  };
  for (const [address, value] of Object.entries(context)) {
    const cell = sheet.getCell(address);
    cell.value = value;
    cell.font = { name: "Arial", size: 10, bold: /^[AD]/.test(address), color: { argb: `FF${INK}` } };
    cell.alignment = { vertical: "middle", wrapText: true };
  }
  sheet.getCell("E3").numFmt = "dd/mm/yyyy";
  for (const row of [3, 4, 5]) sheet.getRow(row).height = Math.max(28, Math.ceil(String(sheet.getCell(row, 2).value).length / 32) * 14 + 10);
  overviewTableHeader(sheet.getRow(8), ["Indicador", "Resultado"]);
  const metrics = [
    ["Venta neta", salesValues ? { formula: `SUM('Ventas'!P9:P${lastRow})`, result: sales } : "No disponible", MONEY],
    ["Unidades vendidas", unitValues ? { formula: `SUM('Ventas'!N9:N${lastRow})`, result: units } : "No disponible", "#,##0"],
    ["Registros", { formula: `COUNTA('Ventas'!B9:B${lastRow})`, result: count }, "#,##0"],
  ];
  metrics.forEach(([label, value, format], index) => {
    const row = sheet.getRow(9 + index);
    row.values = [label, value]; row.height = 30;
    row.eachCell((cell, col) => {
      cell.font = { name: "Arial", size: col === 2 ? 12 : 10, bold: col === 2, color: { argb: `FF${BLUE}` } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0FA" } };
      cell.alignment = { vertical: "middle", horizontal: col === 2 ? "right" : "left" };
    });
    row.getCell(2).numFmt = format;
  });
  sheet.getCell("D9").value = { text: "Abrir detalle de ventas", hyperlink: "#'Ventas'!A8" };
  sheet.getCell("D9").font = { name: "Arial", size: 11, bold: true, underline: true, color: { argb: `FF${BLUE}` } };
  sheet.getCell("A13").value = "Ventas por tienda";
  sheet.getCell("A13").font = { name: "Arial", size: 12, bold: true, color: { argb: `FF${BLUE}` } };
  sheet.getRow(13).height = 28;
  overviewTableHeader(sheet.getRow(14), ["Código", "Tienda", "Registros", "Unidades", "Venta neta (S/)", "Participación"]);
  const storeRows = [...byStore.values()].sort((a, b) => b.sales - a.sales);
  storeRows.forEach((store, index) => {
    const rowNumber = 15 + index;
    const row = sheet.getRow(rowNumber);
    row.values = [store.id, store.name,
      { formula: `COUNTIF('Ventas'!$E$9:$E$${lastRow},A${rowNumber})`, result: store.count },
      store.unitValues ? { formula: `SUMIF('Ventas'!$E$9:$E$${lastRow},A${rowNumber},'Ventas'!$N$9:$N$${lastRow})`, result: store.units } : null,
      store.salesValues ? { formula: `SUMIF('Ventas'!$E$9:$E$${lastRow},A${rowNumber},'Ventas'!$P$9:$P$${lastRow})`, result: store.sales } : null,
      store.salesValues && sales ? { formula: `E${rowNumber}/$B$9`, result: store.sales / sales } : null];
    row.height = Math.max(28, Math.ceil(store.name.length / 32) * 14 + 10);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: "Arial", size: 10, color: { argb: `FF${INK}` } };
      cell.alignment = { vertical: "middle", horizontal: col > 2 ? "right" : "left", wrapText: col === 2 };
      if (index % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5FA" } };
      cell.numFmt = col === 5 ? MONEY : col === 6 ? "0.0%" : col > 2 ? "#,##0" : "@";
    });
  });
  sheet.autoFilter = `A14:F${14 + storeRows.length}`;
  sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    printArea: `A1:F${14 + storeRows.length}` };
}

export async function buildSalesWorkbook(rows, { filters, stores = [], cutoff = "" }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Asiste";
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.views = [{ activeTab: 0, firstSheet: 0 }];
  const overview = workbook.addWorksheet("Resumen", { properties: { tabColor: { argb: `FF${BLUE}` } } });
  const sheet = workbook.addWorksheet("Ventas", { properties: { tabColor: { argb: `FF${BLUE}` } } });
  const columns = ANNUAL_DETAIL_COLUMNS.ventas;
  const widths = [15, 9, 8, 8, 19, 30, 22, 23, 52, 21, 25, 25, 22, 16, 21, 23, 24, 21];
  sheet.columns = columns.map((key, index) => ({ key, width: widths[index] }));
  sheet.views = [{ showGridLines: false, state: "frozen", xSplit: 1, ySplit: HEADER_ROW,
    topLeftCell: "B9", activeCell: "B9", zoomScale: 90 }];
  sheet.getCell("A2").value = `Reporte de ventas ${filters.year}`;
  sheet.getCell("A2").font = { name: "Arial", size: 16, bold: true, color: { argb: `FF${BLUE}` } };
  sheet.getRow(2).height = 28;
  const month = filters.month ? new Intl.DateTimeFormat("es-PE", { month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(filters.year, filters.month - 1, 1))) : "Todo el año";
  sheet.getCell("A3").value = [month, filters.day ? `Día ${filters.day}` : "", filters.cluster ? `Clúster ${filters.cluster}` : "",
    filters.format, filters.storeId ? stores.find(store => store.id === filters.storeId)?.name || filters.storeId : "Todas las tiendas seleccionadas",
    filters.rubro, filters.gender, filters.linea, filters.sublinea].filter(Boolean).join(" · ");
  sheet.getCell("A3").font = { name: "Arial", size: 10, italic: true, color: { argb: "FF58677A" } };
  sheet.getRow(3).height = 22;
  sheet.getCell("A4").value = cutoff ? `Datos al ${cutoff.split("-").reverse().join("/")}` : "";
  sheet.getCell("A4").font = { name: "Arial", size: 10, color: { argb: "FF58677A" } };
  sheet.getCell("F5").value = "Venta neta";
  sheet.getCell("F6").value = "Unidades vendidas";
  sheet.getCell("I5").value = "Registros visibles";
  sheet.getCell("I6").value = "Los totales se actualizan al filtrar.";
  for (const address of ["F5", "F6", "I5"]) sheet.getCell(address).font = {
    name: "Arial", size: 10, bold: true, color: { argb: `FF${INK}` },
  };
  sheet.getCell("I6").font = { name: "Arial", size: 10, italic: true, color: { argb: "FF58677A" } };
  sheet.getRow(5).height = 24;
  sheet.getRow(6).height = 24;
  const header = sheet.getRow(HEADER_ROW);
  header.values = columns.map(key => ANNUAL_REPORT_LABELS[key]);
  header.height = 34;
  header.eachCell(cell => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BLUE}` } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { right: { style: "thin", color: { argb: "FFFFFFFF" } } };
  });
  let count = 0, sales = 0, units = 0, salesValues = 0, unitValues = 0;
  const byStore = new Map();
  for await (const item of rows) {
    if (count >= MAX_SALES_EXCEL_ROWS) throw new Error("El Excel admite hasta 50 000 filas por descarga. Filtra por mes, tienda o clasificación, o usa Descargar CSV para obtener el detalle completo.");
    const values = columns.map(key => {
      if (NUMBERS.has(key)) return numberValue(item[key]);
      if (key === "fecha" && /^\d{4}-\d{2}-\d{2}$/.test(item[key] || "")) return new Date(`${item[key]}T00:00:00Z`);
      return item[key] == null ? null : String(item[key]);
    });
    const row = sheet.addRow(values);
    const lines = values.reduce((max, value, index) => typeof value === "string"
      ? Math.max(max, ...value.split(/\r?\n/).map(line => Math.ceil(line.length / (widths[index] - 2)))) : max, 1);
    row.height = Math.max(24, lines * 14 + 10);
    row.eachCell({ includeEmpty: true }, (cell, index) => {
      const key = columns[index - 1];
      cell.font = { name: "Arial", size: 10, color: { argb: `FF${INK}` } };
      cell.alignment = { vertical: "middle", horizontal: NUMBERS.has(key) ? "right" : "left",
        wrapText: !NUMBERS.has(key) && key !== "fecha" };
      if (count % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5FA" } };
      if (key === "fecha") cell.numFmt = "dd/mm/yyyy";
      else if (["precio_real", "total_venta"].includes(key)) cell.numFmt = MONEY;
      else if (NUMBERS.has(key)) cell.numFmt = key === "cantidad" ? "#,##0;[Red](#,##0);0" : "0";
      else cell.numFmt = "@";
    });
    if (values[15] != null) { sales += values[15]; salesValues++; }
    if (values[13] != null) { units += values[13]; unitValues++; }
    const storeId = String(item.tienda_id || "");
    if (!byStore.has(storeId)) byStore.set(storeId, { id: storeId,
      name: stores.find(store => store.id === storeId)?.name || String(item.tienda || storeId),
      count: 0, sales: 0, units: 0, salesValues: 0, unitValues: 0 });
    const store = byStore.get(storeId);
    store.count++;
    if (values[15] != null) { store.sales += values[15]; store.salesValues++; }
    if (values[13] != null) { store.units += values[13]; store.unitValues++; }
    count++;
  }
  if (!count) throw new Error("No hay registros para estos filtros.");
  const lastRow = HEADER_ROW + count;
  sheet.getCell("G5").value = salesValues ? { formula: `SUBTOTAL(109,P9:P${lastRow})`, result: sales } : "No disponible";
  sheet.getCell("G5").numFmt = MONEY;
  sheet.getCell("G6").value = unitValues ? { formula: `SUBTOTAL(109,N9:N${lastRow})`, result: units } : "No disponible";
  sheet.getCell("G6").numFmt = "#,##0";
  sheet.getCell("J5").value = { formula: `SUBTOTAL(103,B9:B${lastRow})`, result: count };
  sheet.getCell("J5").numFmt = "#,##0";
  for (const address of ["G5", "G6", "J5"]) {
    const cell = sheet.getCell(address);
    cell.font = { name: "Arial", size: 12, bold: true, color: { argb: `FF${BLUE}` } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0FA" } };
    cell.alignment = { vertical: "middle", horizontal: "right" };
  }
  sheet.autoFilter = { from: `A${HEADER_ROW}`, to: `R${lastRow}` };
  sheet.pageSetup = { paperSize: 8, orientation: "landscape", fitToPage: true,
    fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`,
    printArea: `A1:R${lastRow}`, margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } };
  sheet.headerFooter.oddFooter = "&LAsiste · Ventas&R&P / &N";
  fillOverview(overview, { filters, stores, cutoff, month, count, sales, units, salesValues, unitValues, byStore, lastRow });
  return { workbook, count };
}
