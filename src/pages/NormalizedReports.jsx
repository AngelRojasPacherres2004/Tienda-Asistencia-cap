import { useEffect, useMemo, useState } from "react";
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
const catalogCache = new Map();
const dimensionCache = new Map();

async function* rowsFrom(responsePromise) {
  const { response, error } = await responsePromise;
  if (error) throw error;
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

async function saveCsv(result, filters, kind, name, handle, cutoff, onProgress) {
  const writer = handle ? await handle.createWritable() : null;
  const chunks = writer ? null : [];
  let count = 0;
  let scanned = 0;
  let buffer = "\uFEFF" + result.columns.map(key => ANNUAL_REPORT_LABELS[key] || key).join(",") + "\r\n";
  async function flush() { if (writer) await writer.write(buffer); else chunks.push(buffer); buffer = ""; }
  try {
    const responses = new Map();
    const prefetch = index => {
      if (index >= result.files.length || responses.has(index)) return;
      responses.set(index, fetch(result.files[index].url, { credentials: "same-origin" })
        .then(response => ({ response }), error => ({ error })));
    };
    for (let index = 0; index < Math.min(3, result.files.length); index++) prefetch(index);
    for (let index = 0; index < result.files.length; index++) {
      prefetch(index + 3);
      for await (const row of rowsFrom(responses.get(index))) {
        if (++scanned % 10_000 === 0) await new Promise(resolve => window.setTimeout(resolve, 0));
        if (!matchesAnnualRow(row, filters, kind, cutoff)) continue;
        if (count >= MAX_ROWS) throw new Error("Supera el límite de filas de Excel. Selecciona una tienda, mes o clasificación.");
        buffer += csvLine(row, result.columns);
        count += 1;
        if (buffer.length > 512_000) await flush();
      }
      responses.delete(index);
      onProgress?.(index + 1, result.files.length);
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
  const cacheKey = String(user?.id || user?.usuario || '');
  const [catalog, setCatalog] = useState(() => catalogCache.get(cacheKey)?.data || null);
  const [filters, setFilters] = useState(empty);
  const [kind, setKind] = useState("ventas");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState(null);
  const [retry, setRetry] = useState(0);
  const [dimensions, setDimensions] = useState([]);
  useEffect(() => {
    let active = true;
    const cached = catalogCache.get(cacheKey);
    if (cached?.data?.ready && Date.now() - cached.at < 60_000) {
      setCatalog(cached.data);
      setFilters(current => ({ ...current, year: current.year || String(cached.data.years?.[0] || '') }));
      return () => { active = false; };
    }
    api("/commercial/annual-reports")
      .then(data => { if (active) { if (data.ready) catalogCache.set(cacheKey, { at: Date.now(), data });
        else catalogCache.delete(cacheKey);
        setCatalog(data); setFilters(current => ({ ...current, year: current.year || String(data.years?.[0] || "") })); } })
      .catch(error => { if (active) setMessage({ type: "error", text: error.message }); });
    return () => { active = false; };
  }, [cacheKey, retry]);
  const stores = catalog?.stores || [];
  const allowedStores = stores.filter(store => (!filters.cluster || store.cluster === filters.cluster)
    && (!filters.format || store.format === filters.format));
  const selectedStores = filters.storeId ? allowedStores.filter(store => store.id === filters.storeId) : allowedStores;
  const dimensionStoreIds = selectedStores.map(store => store.id).sort().join(",");
  useEffect(() => {
    if (!catalog?.ready || !filters.year || !dimensionStoreIds) { setDimensions([]); return; }
    let active = true;
    const key = `${cacheKey}/${filters.year}/${dimensionStoreIds}/${catalog.cutoffs?.ventas || ""}`;
    if (dimensionCache.has(key)) { setDimensions(dimensionCache.get(key)); return; }
    if (filters.year === String(catalog.years?.[0]) && !filters.cluster && !filters.format && !filters.storeId
      && Array.isArray(catalog.initialDimensions)) {
      dimensionCache.set(key, catalog.initialDimensions);
      setDimensions(catalog.initialDimensions);
      return;
    }
    setDimensions([]);
    api(`/commercial/annual-reports/dimensions?${paramsOf({ year: filters.year, storeId: filters.storeId,
      cluster: filters.cluster, format: filters.format })}`)
      .then(result => { if (active) { dimensionCache.set(key, result.dimensions || []); setDimensions(result.dimensions || []); } })
      .catch(error => { if (active) setMessage({ type: "error", text: `No se pudieron cargar las clasificaciones: ${error.message}` }); });
    return () => { active = false; };
  }, [catalog, cacheKey, filters.year, filters.storeId, filters.cluster, filters.format, dimensionStoreIds]);
  const rubros = unique(dimensions.map(row => row[0]));
  const lines = unique(dimensions.filter(row => !filters.rubro || row[0] === filters.rubro).map(row => row[1]));
  const sublines = filters.linea ? unique(dimensions.filter(row => (!filters.rubro || row[0] === filters.rubro)
    && row[1] === filters.linea).map(row => row[2])) : [];
  const genders = unique(dimensions.filter(row => !filters.rubro || row[0] === filters.rubro).map(row => genderFromLine(row[1])));
  const visibleReports = (catalog?.reports || []).filter(item => item.years?.length);
  const productFilters = catalog?.reports?.find(item => item.id === kind)?.productFilters !== false;
  const kindAvailable = catalog?.reports?.find(item => item.id === kind)?.years?.includes(Number(filters.year));
  const selectedIds = new Set(selectedStores.map(store => store.id));
  const availableMonths = useMemo(() => catalog?.monthly ? [...new Set((catalog.fileRows || []).filter(item => item.year === Number(filters.year)
    && item.kind === kind && dimensionStoreIds.split(",").includes(item.storeId)).map(item => item.month))].filter(Boolean).sort((a, b) => a - b)
    : [], [catalog?.monthly, catalog?.fileRows, filters.year, kind, dimensionStoreIds]);
  useEffect(() => {
    if (filters.month && availableMonths.includes(Number(filters.month))) return;
    setFilters(current => ({ ...current, month: availableMonths.at(-1) ? String(availableMonths.at(-1)) : "", day: "" }));
  }, [filters.month, availableMonths]);
  const sourceRows = (catalog?.fileRows || []).filter(item => item.year === Number(filters.year)
    && item.kind === kind && selectedIds.has(item.storeId) && (!catalog?.monthly || !filters.month || item.month === Number(filters.month)))
    .reduce((sum, item) => sum + item.rows, 0);
  const rowFilterActive = !!(filters.day || (!catalog?.monthly && filters.month) || (productFilters
    && (filters.rubro || filters.gender || filters.linea || filters.sublinea)));
  const exceedsExcel = sourceRows > MAX_ROWS && !rowFilterActive;
  const dayCount = filters.month ? new Date(Number(filters.year), Number(filters.month), 0).getDate() : 0;
  function change(key, value) {
    if (key === "year") setKind("ventas");
    setFilters(current => {
      const next = { ...current, [key]: value };
      if (["year", "month", "cluster", "format", "storeId"].includes(key)) next.day = "";
      if (["cluster", "format", "storeId"].includes(key)) next.month = "";
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
    if (!filters.month) { setMessage({ type: "error", text: "Selecciona un mes con datos para descargar." }); return; }
    setBusy(type); setProgress(""); setMessage(null);
    try {
      const active = { ...filters, year: Number(filters.year), month: filters.month ? Number(filters.month) : "",
        day: filters.day ? Number(filters.day) : "" };
      if (type === "detail") {
        const applied = productFilters ? active : { ...active, rubro: "", gender: "", linea: "", sublinea: "" };
        const name = `detalle-${kind}-${filters.year}-${filters.month.padStart(2, "0")}.csv`;
        let handle = null;
        if (window.showSaveFilePicker) {
          try { handle = await window.showSaveFilePicker({ suggestedName: name,
            types: [{ description: "CSV para Excel", accept: { "text/csv": [".csv"] } }] }); }
          catch (error) { if (error.name === "AbortError") return; throw error; }
        }
        const result = await api(`/commercial/annual-reports/links?${paramsOf({ ...applied, kind })}`);
        const count = await saveCsv(result, applied, kind, name, handle, catalog?.cutoffs?.[kind],
          (done, total) => setProgress(`${done}/${total}`));
        if (count) setMessage({ type: "success", text: `${count.toLocaleString("es-PE")} filas descargadas.` });
      } else {
        const done = await downloadFile(`/api/commercial/annual-reports/summary.xlsx?${paramsOf(active)}`,
          `resumen-comercial-${filters.year}-${filters.month.padStart(2, "0")}.xlsx`);
        if (done) setMessage({ type: "success", text: "Resumen descargado." });
      }
    } catch (error) { setMessage({ type: "error", text: error.message }); }
    finally { setBusy(""); setProgress(""); }
  }
  const field = (name, key, entries, disabled = false) => <label key={key}>{name}<select value={filters[key]} disabled={disabled}
    onChange={event => change(key, event.target.value)}>{options(entries)}</select></label>;
  const availableClusters = unique(stores.map(store => store.cluster));
  const availableFormats = unique(stores.filter(store => !filters.cluster || store.cluster === filters.cluster).map(store => store.format));
  const singleStoreRole = user?.rol === "jefe_tienda";
  return <section className="panel annual-reports">
    <header className="report-workspace__header"><h2>Análisis y cifras</h2></header>
    {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
    {!catalog ? (message?.type === "error"
      ? <button type="button" className="button button--ghost" onClick={() => { setMessage(null); setRetry(value => value + 1); }}>Reintentar carga de reportes</button>
      : <div className="annual-reports__skeleton" aria-label="Preparando catálogo de reportes"/>) : !catalog.ready ?
      <div className="annual-reports__empty"><p>Los reportes del corte actual aún no están preparados.</p>
        <button type="button" className="button button--ghost" onClick={() => { setCatalog(null); setRetry(value => value + 1); }}>Volver a consultar</button></div> : !catalog.monthly ?
      <div className="annual-reports__empty"><p>Los archivos mensuales aún no están preparados para este corte.</p></div> : <>
      <div className="annual-reports__filters">
        {field("Año", "year", catalog.years.map(year => [String(year)]))}
        {field("Mes", "month", [["", "Selecciona un mes"], ...availableMonths.map(month => [String(month), months[month - 1]])])}
        {field("Día", "day", [["", "Todos"], ...Array.from({ length: dayCount }, (_, index) => [String(index + 1)])], !filters.month)}
        {!singleStoreRole && availableClusters.length > 1 && field("Clúster", "cluster", [["", "Todos"], ...availableClusters.map(value => [value])])}
        {!singleStoreRole && availableFormats.length > 1 && field("Formato", "format", [["", "Todos"], ...availableFormats.map(value => [value])])}
        {!singleStoreRole && allowedStores.length > 1 && field("Tienda", "storeId", [["", "Todas las permitidas"], ...allowedStores.map(store => [store.id, store.name])])}
        {field("Rubro", "rubro", [["", "Todos"], ...rubros.map(value => [value])])}
        {field("Género", "gender", [["", "Todos"], ...genders.map(value => [value])])}
        {field("Línea", "linea", [["", "Todas"], ...lines.map(value => [value])])}
        {field("Sublínea", "sublinea", [["", "Todas"], ...sublines.map(value => [value])], !filters.linea)}
      </div>
      <div className="annual-reports__actions">
        <label>Detalle<select value={kind} onChange={event => { setKind(event.target.value); setFilters(current => ({ ...current, month: "", day: "" })); }}>{visibleReports.map(item =>
          <option key={item.id} value={item.id} disabled={!item.years.includes(Number(filters.year))}>{item.label}{item.years.includes(Number(filters.year)) ? "" : " · sin datos"}</option>)}</select></label>
        <button type="button" className="button button--primary" disabled={!!busy || !filters.year || !filters.month || !selectedStores.length || !kindAvailable || exceedsExcel} onClick={() => run("detail")}><Download size={16}/>{busy === "detail" ? `Descargando ${progress || "…"}` : "Descargar detalle CSV"}</button>
      </div>
      {user?.rol !== "coach" && <div className="annual-reports__summary-action"><button type="button" className="button button--ghost" disabled={!!busy || !filters.year || !filters.month || !selectedStores.length} onClick={() => run("summary")}><FileSpreadsheet size={16}/>{busy === "summary" ? "Generando…" : "Descargar informe integral"}</button></div>}
      {exceedsExcel && <small className="annual-reports__note">Este detalle tiene más de 1 048 575 filas. Elige un mes, tienda o clasificación para abrirlo completo en Excel.</small>}
      {!productFilters && <small className="annual-reports__note">El detalle de tráfico no se clasifica por producto.</small>}
    </>}
  </section>;
}
