import { TRAFFIC_HOURS, trafficPeak } from "../../shared/metrics.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, CalendarDays, Maximize2, Minimize2, RefreshCw, UsersRound, X } from "lucide-react";
import { api, todayISO } from "../lib/api";
import { createMouseDragScroll } from "../lib/mouseDragScroll";
import { trafficMatrixHours } from "../lib/trafficMatrixAxes";
import { watchTrafficUpdates } from "../lib/trafficRefresh";

const HOURS = TRAFFIC_HOURS;
const EMPTY_STORES = [];
const daysAgo = (today, days) => { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - days); return date.toISOString().slice(0, 10); };
const shortDate = (value) => new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`));
const rangeLabel = (range) => range.replaceAll(":00", "h").replace("-", "–");
const dateFromParts = (year, month, day) => `${year}-${month}-${String(day).padStart(2, "0")}`;

export default function TrafficHourMatrix({ user, tiendaId = "", scopeName = "", period, comparisonStores = EMPTY_STORES, refreshKey = 0, storeFormat = false, currentMonth = false }) {
  const [data, setData] = useState(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const [expanded, setExpanded] = useState(false);
  const [today, setToday] = useState(todayISO);
  const [filter, setFilter] = useState({ mode: "month", month: today.slice(0, 7), year: today.slice(0, 4), from: today.slice(0, 8) + "01", to: today });
  const [localRange, setLocalRange] = useState(null);
  const [filterError, setFilterError] = useState("");
  const changeFilter = (key, value) => {
    setFilter(current => ({ ...current, [key]: value }));
    setFilterError("");
  };
  const applyFilter = event => {
    event.preventDefault();
    let { from, to } = filter;
    if (filter.mode === "month") {
      const [year, month] = filter.month.split("-");
      from = dateFromParts(year, month, 1);
      to = dateFromParts(year, month, new Date(Number(year), Number(month), 0).getDate());
    }
    if (filter.mode === "year") {
      from = filter.year + "-01-01";
      to = filter.year + "-12-31";
    }
    const through = to < today ? to : today;
    const days = (Date.parse(through) - Date.parse(from)) / 86400000 + 1;
    if (!Number.isInteger(days) || days < 1 || days > 366) {
      setFilterError("Elige fechas válidas y un período de hasta 366 días.");
      return;
    }
    setFilterError("");
    setLocalRange({ from, to });
  };
  const compact = storeFormat || user?.rol === "jefe_tienda";
  const activeRequest = useRef(null);
  const dragScroll = useMemo(() => createMouseDragScroll(), []);
  const selectedDates = useMemo(() => {
    if (localRange) {
      const start = Date.parse(localRange.from);
      const end = Date.parse(localRange.to < today ? localRange.to : today);
      return Array.from({ length: (end - start) / 86400000 + 1 }, (_, index) => new Date(start + index * 86400000).toISOString().slice(0, 10));
    }
    if (!period && !currentMonth) return Array.from({ length: 7 }, (_, index) => daysAgo(today, index));
    const { year, monthNumber, week, day } = currentMonth ? { year: today.slice(0, 4), monthNumber: today.slice(5, 7) } : period;
    const daysInMonth = new Date(Number(year), Number(monthNumber), 0).getDate();
    const maxVisibleDay = Number(year) === Number(today.slice(0, 4)) && Number(monthNumber) === Number(today.slice(5, 7)) ? Number(today.slice(8, 10)) : daysInMonth;
    return Array.from({ length: maxVisibleDay }, (_, index) => index + 1).filter((value) => (!day || value === Number(day)) && (!week || Math.ceil(value / 7) === Number(week))).map((value) => dateFromParts(year, monthNumber, value));
  }, [period, localRange, today, currentMonth]);
  const dates = useMemo(() => [...selectedDates].sort((a, b) => b.localeCompare(a)), [selectedDates]);
  const desde = dates.at(-1) || todayISO(); const hasta = dates[0] || desde;
  const load = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    const params = new URLSearchParams({ desde, hasta, ...(tiendaId ? { tienda_id: tiendaId } : {}) });
    try {
      const result = await api(`/trafico/matriz?${params}`, { cache: "no-store", signal: controller.signal });
      if (!controller.signal.aborted) {
        setError("");
        setData({ ...result, tiendaId, loadedAt: new Date() });
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(error.message);
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }, [desde, hasta, tiendaId]);
  useEffect(() => {
    void load();
    const stop = watchTrafficUpdates(async () => {
      setToday(todayISO());
      await load();
    });
    return () => {
      stop();
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [load, refreshKey]);
  useEffect(() => { if (!expanded) return undefined; const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; const close = (event) => event.key === "Escape" && setExpanded(false); window.addEventListener("keydown", close); return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); }; }, [expanded]);
  const view = useMemo(() => {
    const included = new Set(dates);
    const records = data?.tiendaId === tiendaId ? (data.registros || []).filter(row => included.has(row.fecha)) : [];
    const daily = new Map();
    for (const row of records) daily.set(row.fecha, (daily.get(row.fecha) || 0) + Number(row.cantidad || 0));
    const values = new Map(); for (const row of records) { const key = `${row.fecha}|${row.rango_hora}`; values.set(key, (values.get(key) || 0) + Number(row.cantidad || 0)); }
    let maximum = 0; const total = records.reduce((sum, row) => sum + Number(row.cantidad || 0), 0); let peak = HOURS[0]; let peakTotal = -1;
    HOURS.forEach((hour) => { const value = dates.reduce((sum, date) => sum + (values.get(`${date}|${hour}`) || 0), 0); if (value > peakTotal) { peakTotal = value; peak = hour; } });
    const rows = dates.map((date) => { const cells = HOURS.map((hour) => { const value = values.get(`${date}|${hour}`) || 0; maximum = Math.max(maximum, value); return { hour, value, recorded: values.has(`${date}|${hour}`) }; }); return { date, cells, total: daily.get(date) ?? 0, recorded: daily.has(date) }; });
    rows.sort((a, b) => Number(b.recorded) - Number(a.recorded) || b.date.localeCompare(a.date));
    return { rows, maximum, total, peak: peakTotal > 0 ? peak : null, unassigned: records.filter(row => !HOURS.includes(row.rango_hora)).length, records };
  }, [data, dates, tiendaId]);
  const hourRows = useMemo(() => trafficMatrixHours(view.rows, HOURS), [view.rows]);
  const colorRanges = useMemo(() => { if (!view.maximum) return []; return Array.from({ length: 5 }, (_, index) => { const start = Math.floor(index * view.maximum / 5) + 1; const end = Math.floor((index + 1) * view.maximum / 5); return start <= end ? { level: index + 1, label: start === end ? `${start}` : `${start}–${end}` } : null; }).filter(Boolean); }, [view.maximum]);
  const comparison = useMemo(() => {
    if (tiendaId || !comparisonStores.length) return [];
    const byStore = new Map(comparisonStores.map((store) => [Number(store.id), { id: Number(store.id), nombre: store.nombre, total: 0, records: 0, hours: new Map() }]));
    for (const row of view.records) {
      if (!dates.includes(row.fecha)) continue;
      const store = byStore.get(Number(row.tienda_id));
      if (!store) continue;
      const count = Number(row.cantidad || 0);
      store.total += count;
      store.records += 1;
      store.hours.set(row.rango_hora, (store.hours.get(row.rango_hora) || 0) + count);
    }
    return [...byStore.values()].map((store) => ({ ...store, peak: trafficPeak(store.hours) })).sort((a, b) => Number(Boolean(b.records)) - Number(Boolean(a.records)) || b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));
  }, [comparisonStores, view.records, dates, tiendaId]);
  const recordedStores = comparison.filter((store) => store.records > 0);
  const highestStore = recordedStores[0]?.total || 0;
  const roleEyebrow = user?.rol === "gerencia_general" ? "Vista corporativa" : user?.rol === "jefe_zonal" ? "Control zonal" : "Operación de tienda";
  if (error && !data) return <section className="traffic-matrix-card"><h2>Matriz de tráfico por hora</h2><p role="alert">{error}</p><button type="button" onClick={load}>Reintentar</button></section>;
  if (!data) return <section className="traffic-matrix-card"><p role="status">Cargando tráfico del período seleccionado...</p></section>;
  const periodLabel = desde === hasta ? desde : `${desde} al ${hasta}`;
  return <section className={`traffic-matrix-card ${expanded ? "is-expanded" : ""}`}>
    <header className="traffic-matrix-head"><div>{!compact && <span className="traffic-matrix-eyebrow"><Activity size={14} />{roleEyebrow}</span>}<h2>{compact ? (storeFormat ? `Tráfico por hora · ${periodLabel} · Total: ${loading ? "Cargando..." : view.records.length ? `${view.total.toLocaleString("es-PE")} personas` : "Sin registros"}` : "Tráfico por hora") : `Matriz de tráfico por hora${scopeName ? ` · ${scopeName}` : ""}`}</h2></div><div className="traffic-matrix-actions"><button type="button" onClick={load} aria-label="Actualizar matriz"><RefreshCw size={17} className={loading ? "is-spinning" : ""} /></button><button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Cerrar vista ampliada" : "Ampliar matriz"}>{expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>{expanded && <button type="button" onClick={() => setExpanded(false)} aria-label="Cerrar"><X size={19} /></button>}</div></header>
    <form className="traffic-matrix-filters" onSubmit={applyFilter} aria-label="Filtros de tráfico por hora">
      <label>Período<select value={filter.mode} onChange={event => changeFilter("mode", event.target.value)}>
        <option value="month">Mes</option><option value="year">Año completo</option><option value="range">Rango de fechas</option>
      </select></label>
      {filter.mode === "month" && <label>Mes<input type="month" required max={today.slice(0, 7)} value={filter.month} onChange={event => changeFilter("month", event.target.value)} /></label>}
      {filter.mode === "year" && <label>Año<input type="number" required min="1900" max={today.slice(0, 4)} value={filter.year} onChange={event => changeFilter("year", event.target.value)} /></label>}
      {filter.mode === "range" && <>
        <label>Desde<input type="date" required max={today} value={filter.from} onChange={event => changeFilter("from", event.target.value)} /></label>
        <label>Hasta<input type="date" required min={filter.from} max={today} value={filter.to} onChange={event => changeFilter("to", event.target.value)} /></label>
      </>}
      <button type="submit" className="button button--primary">Aplicar</button>
      {localRange && <button type="button" className="button button--ghost" onClick={() => { setLocalRange(null); setFilterError(""); }}>Restablecer</button>}
      {filterError && <p role="alert">{filterError}</p>}
    </form>
    <p className="traffic-matrix-estimate">Período mostrado · {periodLabel}{scopeName ? ` · ${scopeName}` : ""}</p>
    {loading && <p role="status">Actualizando tráfico…</p>}
    {!loading && !error && <p className="traffic-matrix-estimate">{view.records.length
      ? `${view.total.toLocaleString("es-PE")} visitantes en el período. Los días con registros aparecen primero.`
      : "No hay registros de tráfico para esta tienda en el período seleccionado."}</p>}
    {error && <p className="traffic-matrix-error" role="alert">{error} Se conserva la última lectura disponible. <button type="button" onClick={load}>Reintentar</button></p>}
    {!compact && <div className="traffic-matrix-kpis"><span><UsersRound size={18} /><small>Tráfico registrado</small><strong>{view.total.toLocaleString("es-PE")}</strong></span><span><Activity size={18} /><small>Hora de mayor tráfico</small><strong>{view.peak ? rangeLabel(view.peak) : "Sin datos"}</strong></span><span><CalendarDays size={18} /><small>Promedio diario (personas/día)</small><strong>{(view.total / Math.max(dates.length, 1)).toLocaleString("es-PE", { maximumFractionDigits: 1 })}</strong><small>Entre {dates.length} {dates.length === 1 ? "día" : "días"} del período</small></span></div>}
    {view.unassigned > 0 && <div className="traffic-matrix-error">{view.unassigned} registros sin horario válido están incluidos en el total, pero no en las celdas por hora.</div>}
    {!storeFormat && !tiendaId && recordedStores.length > 0 && <section className="traffic-store-comparison" aria-label="Tráfico por tienda">
      <div className="traffic-store-comparison__list">{comparison.map((store, index) => <div className={`traffic-store-comparison__row ${store.records ? "" : "is-empty"}`} key={store.id}>
        <div className="traffic-store-comparison__name"><span>{store.records ? `${index + 1}.` : "—"}</span><strong>{store.nombre}</strong></div>
        <div className="traffic-store-comparison__bar" aria-hidden="true"><i style={{ width: store.records && highestStore ? `${Math.max(2, store.total / highestStore * 100)}%` : "0%" }} /></div>
        <strong className="traffic-store-comparison__total">{store.records ? store.total.toLocaleString("es-PE") : "Sin registros"}</strong>
        <small>{store.records ? `${view.total ? (store.total / view.total * 100).toLocaleString("es-PE", { maximumFractionDigits: 1 }) : "0"}% de la zona · ${store.total && store.peak ? `Pico ${rangeLabel(store.peak)}` : "Sin tráfico contabilizado"}` : "No se registró tráfico en este período"}</small>
      </div>)}</div>
    </section>}
    <p className="traffic-matrix-mobile-hint">Desliza la tabla para ver todos los horarios y días.</p>
    <div className="traffic-matrix-scroll" {...dragScroll} title="Mantén presionado el clic y arrastra para desplazarte" role="region" aria-label="Tráfico: días en columnas y horas en filas" tabIndex={0}>
      <div className="traffic-matrix-grid traffic-matrix-grid--days" style={{ gridTemplateColumns: `128px repeat(${view.rows.length}, minmax(100px, 1fr)) 90px`, minWidth: `${218 + view.rows.length * 100}px` }}>
        <div className="traffic-matrix-corner">Hora / día</div>
        {view.rows.map(day => <div className="traffic-matrix-hour traffic-matrix-day-heading" key={day.date}><strong>{shortDate(day.date)}</strong><small>{day.date}</small></div>)}
        <div className="traffic-matrix-hour">Total por hora</div>
        {hourRows.map(row => <div className="traffic-matrix-row" key={row.hour} style={{ display: "contents" }}>
          <div className="traffic-matrix-date"><strong>{rangeLabel(row.hour)}</strong></div>
          {row.cells.map(cell => <div key={cell.date} className={`traffic-matrix-cell ${cell.value ? "has-value" : ""}`} style={{ "--heat": view.maximum ? Math.ceil(cell.value / view.maximum * 5) / 5 : 0 }} title={`${shortDate(cell.date)}, ${rangeLabel(row.hour)}: ${cell.recorded ? `${cell.value} personas` : "Sin registro"}`}><strong>{cell.recorded ? cell.value : "—"}</strong></div>)}
          <div className="traffic-matrix-total">{row.recorded ? row.total.toLocaleString("es-PE") : "—"}</div>
        </div>)}
        <div className="traffic-matrix-date"><strong>Total por día</strong></div>
        {view.rows.map(day => <div className="traffic-matrix-total" key={day.date}>{day.recorded ? day.total.toLocaleString("es-PE") : "—"}</div>)}
        <div className="traffic-matrix-total">{view.records.length ? view.total.toLocaleString("es-PE") : "—"}</div>
      </div>
    </div>
    <footer className="traffic-matrix-legend"><span>Menor tráfico</span><div className="traffic-matrix-legend-ranges">{colorRanges.length ? colorRanges.map((range) => <span key={range.level}><i style={{ "--legend-heat": range.level / 5 }} />{range.label}</span>) : <span>Sin registros</span>}</div><span>Mayor tráfico</span><small>{loading ? "Actualizando…" : `Actualizado ${data.loadedAt.toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" })}`}</small></footer>
  </section>;
}
