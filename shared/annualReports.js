export const ANNUAL_REPORT_KINDS = Object.freeze([
  { id: "ventas", label: "Ventas", dateLabel: "Fecha de venta", productFilters: true },
  { id: "stock", label: "Stock", dateLabel: "Fecha de corte", productFilters: true },
  { id: "ingresos", label: "Ingresos", dateLabel: "Fecha de ingreso", productFilters: true },
  { id: "transferencias", label: "Transferencias", dateLabel: "Fecha de movimiento", productFilters: true },
  { id: "trafico", label: "Tráfico", dateLabel: "Fecha de conteo", productFilters: false },
]);

export const ANNUAL_DETAIL_COLUMNS = Object.freeze({
  ventas: ["fecha", "anio", "mes", "dia", "tienda_id", "tienda", "nro_venta", "codigo_nissei", "descripcion", "rubro", "linea", "sub_linea", "marca", "cantidad", "precio_real", "total_venta", "tipo_documento", "estado"],
  stock: ["fecha", "anio", "mes", "dia", "tienda_id", "tienda", "codigo_nissei", "descripcion", "rubro", "linea", "sub_linea", "marca", "estado_stock", "cantidad", "valor_stock"],
  ingresos: ["fecha", "anio", "mes", "dia", "tienda_id", "tienda", "codigo_nissei", "descripcion", "rubro", "linea", "sub_linea", "marca", "proveedor", "cantidad_recibida", "total_ingreso", "tipo_movimiento_ingreso"],
  transferencias: ["fecha", "anio", "mes", "dia", "tienda_id", "tienda", "direccion", "tienda_origen_id", "tienda_origen", "tienda_destino_id", "tienda_destino", "nro_guia", "codigo_nissei", "descripcion", "rubro", "linea", "sub_linea", "marca", "cantidad", "total_transferencia", "estado_transferencia"],
  trafico: ["fecha", "anio", "mes", "dia", "tienda_id", "tienda", "cantidad_personas", "tipo_conteo", "fuente_conteo", "estado_registro"],
});

export const ANNUAL_REPORT_LABELS = Object.freeze({
  fecha: "Fecha", anio: "Año", mes: "Mes", dia: "Día", tienda_id: "Código de tienda", tienda: "Tienda",
  nro_venta: "N.º de venta", codigo_nissei: "Código de producto", descripcion: "Descripción", rubro: "Rubro",
  linea: "Línea", sub_linea: "Sublínea", marca: "Marca", cantidad: "Unidades", precio_real: "Precio real (S/)",
  total_venta: "Venta neta (S/)", tipo_documento: "Tipo de documento", estado: "Estado",
  estado_stock: "Estado de stock", valor_stock: "Valor de stock (S/)", proveedor: "Proveedor",
  cantidad_recibida: "Unidades recibidas", total_ingreso: "Valor de ingreso (S/)",
  tipo_movimiento_ingreso: "Tipo de ingreso", direccion: "Movimiento", tienda_origen_id: "Código de origen",
  tienda_origen: "Tienda de origen", tienda_destino_id: "Código de destino", tienda_destino: "Tienda de destino",
  nro_guia: "N.º de guía", total_transferencia: "Valor transferido (S/)",
  estado_transferencia: "Estado de transferencia", cantidad_personas: "Personas", tipo_conteo: "Tipo de conteo",
  fuente_conteo: "Fuente de tráfico", estado_registro: "Estado del registro",
});

const GENDERS = new Map([
  ["BEBE", "BEBE"], ["JOVENCITA", "JOVENCITA"], ["JOVENCITO", "JOVENCITO"],
  ["CABALLERO", "CABALLERO"], ["DAMA", "DAMA"], ["NINA", "NIÑA"],
  ["NINO", "NIÑO"], ["UNISEX", "UNISEX"],
]);

export function genderFromLine(line) {
  const value = String(line || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  for (const [suffix, label] of GENDERS) if (value.endsWith(suffix)) return label;
  return "";
}

export function annualReportPath(version, year, kind, storeId, suffix = "jsonl.gz") {
  if (!/^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/.test(version)
    || !/^20\d{2}$/.test(String(year)) || !ANNUAL_DETAIL_COLUMNS[kind]
    || !/^T\d{3}$/.test(storeId) || !["jsonl.gz", "summary.json.gz"].includes(suffix)) {
    throw new Error("Ruta de reporte anual no válida.");
  }
  return `commercial-annual/${version}/${year}/${kind}/${storeId}.${suffix}`;
}

export function annualSummaryPath(version, year, storeId) {
  if (!/^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/.test(version)
    || !/^20\d{2}$/.test(String(year)) || !/^T\d{3}$/.test(storeId)) {
    throw new Error("Ruta de resumen anual no válida.");
  }
  return `commercial-annual/${version}/${year}/summary/${storeId}.json.gz`;
}

export function parseAnnualFilters(input = {}) {
  const year = String(input.year || "");
  if (!/^20\d{2}$/.test(year)) throw new Error("Selecciona un único año para descargar.");
  const month = input.month === "" || input.month == null ? "" : Number(input.month);
  const day = input.day === "" || input.day == null ? "" : Number(input.day);
  if (month !== "" && (!Number.isInteger(month) || month < 1 || month > 12)) throw new Error("Mes no válido.");
  if (day !== "" && (month === "" || !Number.isInteger(day) || day < 1 ||
    day > new Date(Number(year), month, 0).getDate())) throw new Error("Día no válido para el mes seleccionado.");
  const fields = ["cluster", "format", "storeId", "rubro", "gender", "linea", "sublinea"];
  const result = { year: Number(year), month, day };
  for (const field of fields) {
    const value = String(input[field] || "").trim();
    if (value.length > 100) throw new Error(`Filtro ${field} demasiado largo.`);
    result[field] = value;
  }
  return result;
}

export function matchesAnnualRow(row, filters, kind) {
  if (Number(row.anio) !== filters.year) return false;
  if (filters.month !== "" && Number(row.mes) !== filters.month) return false;
  if (filters.day !== "" && Number(row.dia) !== filters.day) return false;
  if (filters.storeId && row.tienda_id !== filters.storeId) return false;
  if (kind === "trafico") return true;
  if (filters.rubro && row.rubro !== filters.rubro) return false;
  if (filters.linea && row.linea !== filters.linea) return false;
  if (filters.sublinea && row.sub_linea !== filters.sublinea) return false;
  if (filters.gender && genderFromLine(row.linea) !== filters.gender) return false;
  return true;
}

export function csvCell(value) {
  if (value == null) return "";
  let text = String(value);
  if (/^[\s]*[=+@-]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvLine(row, columns) {
  return columns.map(key => csvCell(row[key])).join(",") + "\r\n";
}
