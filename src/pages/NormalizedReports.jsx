import { useEffect, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { api, downloadFile } from "../lib/api";
import { Notice } from "../components/UI";
import { ANNUAL_REPORT_LABELS, csvLine, genderFromLine, matchesAnnualRow } from "../../shared/annualReports.js";
import "./system-uploads.css";

const MAX_ROWS = 1_048_575; // Una fila adicional para encabezados.
const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const empty = { year: "", month: "", day: "", cluster: "", format: "", storeId: "", rubro: "", gender: "", linea: "", sublinea: "" };
const unique = values => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
const paramsOf = values => new URLSearchParams(Object.entries(values).filter(([, value]) => value !== ""));
const options = values => values.map(([value, label]) => <option key={value} value={value}>{label || value}</option>);

async function* rowsFrom(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error("No se pudo leer el archivo anual.");
  if (!response.body || !window.DecompressionStream) throw new Error("Tu navegador no admite estos archivos comprimidos.");
  const reader = response.body.pipeThrough(new DecompressionStream("gzip")).pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      let end;
      while ((end = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        if (line.trim()) yield JSON.parse(line);
      }
    }
    if (pending.trim()) yield JSON.parse(pending);
  } finally { await reader.cancel().catch(() => {}); }
}

async function saveCsv(result, filters, kind, name, handle) {
  const writer = handle ? await handle.createWritable() : null;
  const chunks = writer ? null : [];
  let count = 0;
  let buffer = "\uFEFF" + result.columns.map(key => ANNUAL_REPORT_LABELS[key] || key).join(",") + "\r\n";
  async function flush() { if (writer) await writer.write(buffer); else chunks.push(buffer); buffer = ""; }
  try {
    for (const file of result.files) for await (const row of rowsFrom(file.url)) {
      if (!matchesAnnualRow(row, filters, kind)) continue;
      if (count >= MAX_ROWS) throw new Error("Supera el límite de filas de Excel. Selecciona una tienda, mes o clasificación.");
      buffer += csvLine(row, result.columns);
      count += 1;
      if (buffer.length > 512_000) await flush();
    }
    if (!count) throw new Error("No hay registros para estos filtros.");
    if (buffer) await flush();
    if (writer) await writer.close();
    else {
      const url = URL.createObjectURL(new Blob(chunks, { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = name;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
    return count;
  } catch (error) { if (writer) await writer.abort().catch(() => {}); throw error; }
}

export default function NormalizedReports({ user }) {
  const [catalog, setCatalog] = useState(null);
  const [filters, setFilters] = useState(empty);
  const [kind, setKind] = useState("ventas");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState(null);
  useEffect(() => {
    let active = true;
    api("/commercial/annual-reports")
      .then(data => { if (active) { setCatalog(data); setFilters(current => ({ ...current, year: String(data.years?.[0] || "") })); } })
      .catch(error => { if (active) setMessage({ type: "error", text: error.message }); });
    return () => { active = false; };
  }, []);
  const stores = catalog?.stores || [];
  const allowedStores = stores.filter(store => (!filters.cluster || store.cluster === filters.cluster)
    && (!filters.format || store.format === filters.format));
  const selectedStores = filters.storeId ? allowedStores.filter(store => store.id === filters.storeId) : allowedStores;
  const dimensions = selectedStores.flatMap(store => catalog?.dimensions?.[`${filters.year}/${store.id}`] || []);
  const rubros = unique(dimensions.map(row => row[0]));
  const lines = unique(dimensions.filter(row => !filters.rubro || row[0] === filters.rubro).map(row => row[1]));
  const sublines = unique(dimensions.filter(row => (!filters.rubro || row[0] === filters.rubro)
    && (!filters.linea || row[1] === filters.linea)).map(row => row[2]));
  const genders = unique(dimensions.filter(row => !filters.rubro || row[0] === filters.rubro).map(row => genderFromLine(row[1])));
  const productFilters = catalog?.reports?.find(item => item.id === kind)?.productFilters !== false;
  const kindAvailable = catalog?.reports?.find(item => item.id === kind)?.years?.includes(Number(filters.year));
  const selectedIds = new Set(selectedStores.map(store => store.id));
  const sourceRows = (catalog?.fileRows || []).filter(item => item.year === Number(filters.year)
    && item.kind === kind && selectedIds.has(item.storeId)).reduce((sum, item) => sum + item.rows, 0);
  const rowFilterActive = !!(filters.month || filters.day || (productFilters
    && (filters.rubro || filters.gender || filters.linea || filters.sublinea)));
  const exceedsExcel = sourceRows > MAX_ROWS && !rowFilterActive;
  const dayCount = filters.month ? new Date(Number(filters.year), Number(filters.month), 0).getDate() : 0;
  function change(key, value) {
    if (key === "year") setKind("ventas");
    setFilters(current => {
      const next = { ...current, [key]: value };
      if (["year", "month"].includes(key)) next.day = "";
      if (["cluster", "format"].includes(key)) next.storeId = "";
      if (["year", "cluster", "format", "storeId"].includes(key)) {
        next.rubro = ""; next.gender = ""; next.linea = ""; next.sublinea = "";
      }
      if (key === "rubro") { next.gender = ""; next.linea = ""; next.sublinea = ""; }
      if (key === "linea") next.sublinea = "";
      return next;
    });
  }
  async function run(type) {
    setBusy(type); setMessage(null);
    try {
      const active = { ...filters, year: Number(filters.year), month: filters.month ? Number(filters.month) : "",
        day: filters.day ? Number(filters.day) : "" };
      if (type === "detail") {
        const applied = productFilters ? active : { ...active, rubro: "", gender: "", linea: "", sublinea: "" };
        const name = `detalle-${kind}-${filters.year}.csv`;
        let handle = null;
        if (window.showSaveFilePicker) {
          try { handle = await window.showSaveFilePicker({ suggestedName: name,
            types: [{ description: "CSV para Excel", accept: { "text/csv": [".csv"] } }] }); }
          catch (error) { if (error.name === "AbortError") return; throw error; }
        }
        const result = await api(`/commercial/annual-reports/links?${paramsOf({ ...applied, kind })}`);
        const count = await saveCsv(result, applied, kind, name, handle);
        if (count) setMessage({ type: "success", text: `${count.toLocaleString("es-PE")} filas descargadas.` });
      } else {
        const done = await downloadFile(`/api/commercial/annual-reports/summary.xlsx?${paramsOf(active)}`,
          `resumen-comercial-${filters.year}.xlsx`);
        if (done) setMessage({ type: "success", text: "Resumen descargado." });
      }
    } catch (error) { setMessage({ type: "error", text: error.message }); }
    finally { setBusy(""); }
  }
  const field = (name, key, entries, disabled = false) => <label key={key}>{name}<select value={filters[key]} disabled={disabled}
    onChange={event => change(key, event.target.value)}>{options(entries)}</select></label>;
  return <section className="panel annual-reports">
    <header className="report-workspace__header"><h2>Cifras comerciales</h2></header>
    {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
    {!catalog ? <p>Cargando reportes…</p> : !catalog.ready ?
      <p>Los reportes del corte actual aún no están preparados.</p> : <>
      <div className="annual-reports__filters">
        {field("Año", "year", catalog.years.map(year => [String(year)]))}
        {field("Mes", "month", [["", "Todo el año"], ...months.map((label, index) => [String(index + 1), label])])}
        {field("Día", "day", [["", "Todos"], ...Array.from({ length: dayCount }, (_, index) => [String(index + 1)])], !filters.month)}
        {field("Clúster", "cluster", [["", "Todos"], ...unique(stores.map(store => store.cluster)).map(value => [value])])}
        {field("Formato", "format", [["", "Todos"], ...unique(stores.filter(store => !filters.cluster || store.cluster === filters.cluster).map(store => store.format)).map(value => [value])])}
        {field("Tienda", "storeId", [["", "Todas las permitidas"], ...allowedStores.map(store => [store.id, store.name])])}
        {field("Rubro", "rubro", [["", "Todos"], ...rubros.map(value => [value])])}
        {field("Género", "gender", [["", "Todos"], ...genders.map(value => [value])])}
        {field("Línea", "linea", [["", "Todas"], ...lines.map(value => [value])])}
        {field("Sublínea", "sublinea", [["", "Todas"], ...sublines.map(value => [value])])}
      </div>
      <div className="annual-reports__actions">
        <label>Detalle<select value={kind} onChange={event => setKind(event.target.value)}>{catalog.reports.map(item =>
          <option key={item.id} value={item.id} disabled={!item.years.includes(Number(filters.year))}>{item.label}{item.years.includes(Number(filters.year)) ? "" : " · sin datos"}</option>)}</select></label>
        <button type="button" className="button button--primary" disabled={!!busy || !filters.year || !selectedStores.length || !kindAvailable || exceedsExcel} onClick={() => run("detail")}><Download size={16}/>{busy === "detail" ? "Descargando…" : "Descargar detalle CSV"}</button>
        {user?.rol !== "coach" && <button type="button" className="button button--ghost" disabled={!!busy || !filters.year || !selectedStores.length} onClick={() => run("summary")}><FileSpreadsheet size={16}/>{busy === "summary" ? "Generando…" : "Resumen general Excel"}</button>}
      </div>
      <small className="annual-reports__note">Cada descarga corresponde a un solo año. El detalle tiene columnas separadas; el resumen combina indicadores por día y tienda.</small>
      {exceedsExcel && <small className="annual-reports__note">Este detalle tiene más de 1 048 575 filas. Elige un mes, tienda o clasificación para abrirlo completo en Excel.</small>}
      {!productFilters && <small className="annual-reports__note">El detalle de tráfico no se clasifica por producto.</small>}
    </>}
  </section>;
}
