import ExcelJS from "exceljs";

export async function exportExcel(filename, rows, sheetName = "Registros") {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]); const label = (key) => key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = keys.map((key) => { const long = /observaci|descripci|detalle|comentario/i.test(key); const width = Math.min(Math.max(label(key).length, ...rows.map((row) => String(row[key] ?? "").length)) + 3, long ? 48 : 32); return { header: label(key), key, width: Math.max(width, long ? 28 : 14) }; });
  sheet.addRows(rows); const header = sheet.getRow(1); header.height = 30; header.font = { name: "Aptos Display", bold: true, color: { argb: "FFFFFFFF" } }; header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D4F86" } }; sheet.autoFilter = { from: "A1", to: `${sheet.getColumn(keys.length).letter}1` };
  sheet.eachRow((row, index) => { if (index === 1) return; row.height = 24; row.eachCell((cell) => { cell.font = { name: "Aptos", size: 10, color: { argb: "FF1C3044" } }; cell.alignment = { vertical: "middle", wrapText: false }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? "FFF4F8FB" : "FFFFFFFF" } }; cell.border = { bottom: { style: "hair", color: { argb: "FFC7D7E5" } } }; }); });
  const buffer = await workbook.xlsx.writeBuffer(); const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
}
