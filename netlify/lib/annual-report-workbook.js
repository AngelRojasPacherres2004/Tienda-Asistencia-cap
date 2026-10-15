import ExcelJS from "exceljs";
import { genderFromLine } from "../../shared/annualReports.js";

const BLUE = "183F87";
const PRODUCT_KINDS = new Set(["ventas", "ingresos", "stock", "transferencias"]);

function productMatches(row, filters) {
  if (filters.rubro && row.rubro !== filters.rubro) return false;
  if (filters.linea && row.linea !== filters.linea) return false;
  if (filters.sublinea && row.sub_linea !== filters.sublinea) return false;
  if (filters.gender && genderFromLine(row.linea) !== filters.gender) return false;
  return true;
}

function inPeriod(row, filters) {
  return Number(row.anio) === filters.year
    && (filters.month === "" || Number(row.mes) === filters.month)
    && (filters.day === "" || Number(row.dia) === filters.day);
}

export function summarizeAnnualReports(storeRows, filters, stores, cutoffs = {}) {
  const productFiltered = !!(filters.rubro || filters.gender || filters.linea || filters.sublinea);
  const periodEnd = filters.day ? `${filters.year}-${String(filters.month).padStart(2, "0")}-${String(filters.day).padStart(2, "0")}`
    : filters.month ? `${filters.year}-${String(filters.month).padStart(2, "0")}-${String(new Date(filters.year, filters.month, 0).getDate()).padStart(2, "0")}`
      : `${filters.year}-12-31`;
  const daily = new Map();
  const stockByStore = new Map();
  const selectedStores = new Set(storeRows.map(item => item.storeId));
  const rowFor = (date, storeId) => {
    const key = `${date}|${storeId}`;
    if (!daily.has(key)) daily.set(key, { fecha: date, tienda_id: storeId,
      tienda: stores[storeId]?.name || storeId, venta_neta: 0, unidades_vendidas: 0,
      transacciones: 0, trafico: 0, unidades_ingreso: 0, valor_ingreso: 0,
      transferencias_entrada: 0, transferencias_salida: 0 });
    return daily.get(key);
  };
  for (const { storeId, rows } of storeRows) {
    if (!selectedStores.has(storeId)) continue;
    for (const item of rows) {
      if (item.tienda_id !== storeId) continue;
      const sourceKind = item.kind === "ventas_diario" ? "ventas" : item.kind;
      if (cutoffs[sourceKind] && item.fecha > cutoffs[sourceKind]) continue;
      const productKind = PRODUCT_KINDS.has(item.kind);
      if (productKind && !productMatches(item, filters)) continue;
      if (item.kind === "stock") {
        if (Number(item.anio) !== filters.year || item.fecha > periodEnd) continue;
        const current = stockByStore.get(storeId);
        if (!current || item.fecha > current.fecha) stockByStore.set(storeId, { fecha: item.fecha, unidades: 0, valor: 0, estados: new Map() });
        continue;
      }
      if (!inPeriod(item, filters)) continue;
      if (item.kind === "ventas_diario" && productFiltered) continue;
      if (item.kind === "ventas" && !productFiltered) continue;
      if (item.kind === "trafico" && productFiltered) continue;
      const target = rowFor(item.fecha, storeId);
      if (item.kind === "ventas" || item.kind === "ventas_diario") {
        target.venta_neta += Number(item.venta_neta || 0);
        target.unidades_vendidas += Number(item.unidades || 0);
        if (!productFiltered) target.transacciones += Number(item.transacciones || 0);
      } else if (item.kind === "trafico") target.trafico += Number(item.personas || 0);
      else if (item.kind === "ingresos") {
        target.unidades_ingreso += Number(item.unidades || 0);
        target.valor_ingreso += Number(item.valor_ingreso || 0);
      } else if (item.kind === "transferencias") {
        const key = item.direccion === "ENTRADA" ? "transferencias_entrada" : "transferencias_salida";
        target[key] += Number(item.unidades || 0);
      }
    }
    const snapshot = stockByStore.get(storeId);
    if (snapshot) {
      for (const item of rows) {
        if (item.kind !== "stock" || item.fecha !== snapshot.fecha
          || item.tienda_id !== storeId || !productMatches(item, filters)) continue;
        snapshot.unidades += Number(item.unidades || 0);
        snapshot.valor += Number(item.valor_stock || 0);
        const status = String(item.estado_stock || "SIN CLASIFICAR").toUpperCase();
        const statusRow = snapshot.estados.get(status) || { estado: status, unidades: 0, valor: 0 };
        statusRow.unidades += Number(item.unidades || 0);
        statusRow.valor += Number(item.valor_stock || 0);
        snapshot.estados.set(status, statusRow);
      }
    }
  }
  const result = [...daily.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.tienda.localeCompare(b.tienda));
  const totals = result.reduce((sum, row) => {
    for (const key of ["venta_neta", "unidades_vendidas", "transacciones", "trafico", "unidades_ingreso",
      "valor_ingreso", "transferencias_entrada", "transferencias_salida"]) sum[key] += row[key];
    return sum;
  }, { venta_neta: 0, unidades_vendidas: 0, transacciones: 0, trafico: 0,
    unidades_ingreso: 0, valor_ingreso: 0, transferencias_entrada: 0, transferencias_salida: 0 });
  const stock = [...stockByStore.values()].reduce((sum, row) => ({
    unidades: sum.unidades + row.unidades, valor: sum.valor + row.valor,
  }), { unidades: 0, valor: 0 });
  const periodStart = `${filters.year}-${String(filters.month || 1).padStart(2, "0")}-${String(filters.day || 1).padStart(2, "0")}`;
  const unavailable = Object.fromEntries(Object.entries(cutoffs).map(([kind, cutoff]) => [kind, !cutoff || cutoff < periodStart]));
  return { rows: result, totals, stock: stockByStore.size ? stock : null,
    stockStores: [...stockByStore.entries()].flatMap(([storeId, row]) =>
      [...row.estados.values()].sort((a, b) =>
        (a.estado === "BUENO" ? -1 : b.estado === "BUENO" ? 1 : a.estado.localeCompare(b.estado, "es")))
        .map(status => ({ storeId, fecha: row.fecha, ...status }))),
    stockDates: [...new Set([...stockByStore.values()].map(row => row.fecha))].sort(),
    productFiltered, unavailable, cutoffs };
}

function styleTable(sheet, headerRow) {
  const row = sheet.getRow(headerRow);
  row.font = { name: "Arial", bold: true, color: { argb: `FF${BLUE}` }, size: 10 };
  row.alignment = { vertical: "middle", horizontal: "center" };
  row.height = 23;
  sheet.views = [{ state: "frozen", ySplit: headerRow }];
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: sheet.columnCount } };
}

export function buildAnnualSummaryWorkbook(summary, filters, stores) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Asiste";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Resumen");
  sheet.views = [{ showGridLines: false }];
  sheet.getCell("A2").value = `Resumen comercial ${filters.year}`;
  sheet.getCell("A2").font = { name: "Arial", size: 16, bold: true, color: { argb: `FF${BLUE}` } };
  const scope = [filters.month ? `Mes ${filters.month}` : "", filters.day ? `Día ${filters.day}` : "",
    filters.cluster, filters.format, filters.storeId && stores[filters.storeId]?.name,
    filters.rubro, filters.gender, filters.linea, filters.sublinea].filter(Boolean).join(" · ");
  sheet.getCell("A3").value = scope;
  sheet.getCell("A3").font = { name: "Arial", size: 10, italic: true, color: { argb: "FF58677A" } };
  sheet.getRow(5).values = ["Indicador", "Resultado"];
  styleTable(sheet, 5);
  const { totals, productFiltered, unavailable } = summary;
  const indicators = [
    ["Venta neta (S/)", unavailable.ventas ? null : totals.venta_neta],
    ["Unidades vendidas", unavailable.ventas ? null : totals.unidades_vendidas],
    ["Transacciones", productFiltered || unavailable.ventas ? null : totals.transacciones],
    ["Tráfico", productFiltered || unavailable.trafico ? null : totals.trafico],
    ["Ticket promedio (S/)", productFiltered || !totals.transacciones || unavailable.ventas ? null : totals.venta_neta / totals.transacciones],
    ["Conversión", productFiltered || !totals.trafico || unavailable.ventas || unavailable.trafico ? null : totals.transacciones / totals.trafico],
    ["Ingresos (unidades)", unavailable.ingresos ? null : totals.unidades_ingreso],
    ["Ingresos (S/)", unavailable.ingresos ? null : totals.valor_ingreso],
    ["Stock (unidades)", summary.stock?.unidades ?? null],
    ["Stock (S/)", summary.stock?.valor ?? null],
  ];
  for (const [label, value] of indicators) sheet.addRow([label, value ?? "No disponible"]);
  sheet.getColumn(1).width = 38;
  sheet.getColumn(2).width = 23;
  for (let row = 6; row <= 5 + indicators.length; row++)
    sheet.getCell(row, 2).numFmt = row === 11 ? "0.0%" : "#,##0.00";

  const detail = workbook.addWorksheet("Diario por tienda");
  detail.views = [{ showGridLines: false }];
  detail.columns = [
    { header: "Fecha", key: "fecha", width: 14 }, { header: "Año", key: "anio", width: 9 },
    { header: "Mes", key: "mes", width: 8 }, { header: "Día", key: "dia", width: 8 },
    { header: "Código de tienda", key: "tienda_id", width: 16 }, { header: "Tienda", key: "tienda", width: 28 },
    { header: "Venta neta (S/)", key: "venta_neta", width: 19 },
    { header: "Unidades vendidas", key: "unidades_vendidas", width: 18 },
    { header: "Transacciones", key: "transacciones", width: 16 },
    { header: "Tráfico", key: "trafico", width: 14 },
    { header: "Ticket promedio (S/)", key: "ticket", width: 21 },
    { header: "Conversión", key: "conversion", width: 15 },
    { header: "Ingresos (unidades)", key: "unidades_ingreso", width: 19 },
    { header: "Ingresos (S/)", key: "valor_ingreso", width: 18 },
    { header: "Transferencias entrada", key: "transferencias_entrada", width: 22 },
    { header: "Transferencias salida", key: "transferencias_salida", width: 21 },
  ];
  for (const row of summary.rows) detail.addRow({ ...row, anio: Number(row.fecha.slice(0, 4)),
    mes: Number(row.fecha.slice(5, 7)), dia: Number(row.fecha.slice(8, 10)),
    venta_neta: unavailable.ventas ? null : row.venta_neta,
    unidades_vendidas: unavailable.ventas ? null : row.unidades_vendidas,
    transacciones: productFiltered || unavailable.ventas ? null : row.transacciones,
    trafico: productFiltered || unavailable.trafico ? null : row.trafico,
    ticket: productFiltered || !row.transacciones ? null : row.venta_neta / row.transacciones,
    conversion: productFiltered || !row.trafico ? null : row.transacciones / row.trafico });
  styleTable(detail, 1);
  detail.getColumn("L").numFmt = "0.0%";
  for (const col of ["G", "K", "N"]) detail.getColumn(col).numFmt = "#,##0.00";
  const inventory = workbook.addWorksheet("Stock por tienda");
  inventory.views = [{ showGridLines: false }];
  inventory.columns = [
    { header: "Código de tienda", key: "tienda_id", width: 18 },
    { header: "Tienda", key: "tienda", width: 30 },
    { header: "Fecha de corte", key: "fecha", width: 16 },
    { header: "Estado de stock", key: "estado", width: 20 },
    { header: "Unidades", key: "unidades", width: 17 },
    { header: "Valor de stock (S/)", key: "valor", width: 22 },
  ];
  for (const row of summary.stockStores) inventory.addRow({
    tienda_id: row.storeId, tienda: stores[row.storeId]?.name || row.storeId,
    fecha: row.fecha, estado: row.estado, unidades: row.unidades, valor: row.valor,
  });
  styleTable(inventory, 1);
  inventory.getColumn("F").numFmt = "#,##0.00";
  return workbook;
}
