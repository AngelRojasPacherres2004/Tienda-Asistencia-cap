import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, CalendarDays, Maximize2, Minimize2, RefreshCw, UsersRound, X } from "lucide-react";
import { api, todayISO } from "../lib/api";

const HOURS = Array.from({ length: 13 }, (_, i) => `${String(i + 9).padStart(2, "0")}:00-${String(i + 10).padStart(2, "0")}:00`);
const daysAgo = (days) => { const date = new Date(`${todayISO()}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - days); return date.toISOString().slice(0, 10); };
const shortDate = (value) => new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`));
const rangeLabel = (range) => range.replaceAll(":00", "h").replace("-", "–");
const dateFromParts = (year, month, day) => `${year}-${month}-${String(day).padStart(2, "0")}`;

export default function TrafficHourMatrix({ user, tiendaId = "", scopeName = "", period, refreshKey = 0 }) {
  const [data, setData] = useState(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const [expanded, setExpanded] = useState(false);
  const requestId = useRef(0);
  const selectedDates = useMemo(() => {
    if (!period) return Array.from({ length: 7 }, (_, index) => daysAgo(index));
    const { year, monthNumber, week, day } = period;
    const today = todayISO(); const daysInMonth = new Date(Number(year), Number(monthNumber), 0).getDate();
    const maxVisibleDay = year === today.slice(0, 4) && monthNumber === today.slice(5, 7) ? Number(today.slice(8, 10)) : daysInMonth;
    return Array.from({ length: maxVisibleDay }, (_, index) => index + 1).filter((value) => (!day || value === Number(day)) && (!week || Math.ceil(value / 7) === Number(week))).map((value) => dateFromParts(year, monthNumber, value));
  }, [period]);
  const dates = useMemo(() => [...selectedDates].sort((a, b) => b.localeCompare(a)), [selectedDates]);
  const desde = dates.at(-1) || todayISO(); const hasta = dates[0] || desde;
  const load = useCallback(() => { const current = ++requestId.current; setLoading(true); setError(""); const params = new URLSearchParams({ desde, hasta, ...(tiendaId ? { tienda_id: tiendaId } : {}) }); api(`/trafico/matriz?${params}`).then((result) => { if (current === requestId.current) setData(result); }).catch((e) => { if (current === requestId.current) setError(e.message); }).finally(() => { if (current === requestId.current) setLoading(false); }); }, [desde, hasta, tiendaId, refreshKey]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!expanded) return undefined; const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; const close = (event) => event.key === "Escape" && setExpanded(false); window.addEventListener("keydown", close); return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); }; }, [expanded]);
  const view = useMemo(() => {
    const values = new Map(); for (const row of data?.registros || []) { const key = `${row.fecha}|${row.rango_hora}`; values.set(key, (values.get(key) || 0) + Number(row.cantidad || 0)); }
    let maximum = 0; let total = 0; let peak = HOURS[0]; let peakTotal = -1;
    HOURS.forEach((hour) => { const value = dates.reduce((sum, date) => sum + (values.get(`${date}|${hour}`) || 0), 0); if (value > peakTotal) { peakTotal = value; peak = hour; } });
    const rows = dates.map((date) => { const cells = HOURS.map((hour) => { const value = values.get(`${date}|${hour}`) || 0; maximum = Math.max(maximum, value); total += value; return { hour, value }; }); return { date, cells, total: cells.reduce((sum, cell) => sum + cell.value, 0) }; });
    return { rows, maximum, total, peak };
  }, [data, dates]);
  const colorRanges = useMemo(() => { if (!view.maximum) return []; return Array.from({ length: 5 }, (_, index) => { const start = Math.floor(index * view.maximum / 5) + 1; const end = Math.floor((index + 1) * view.maximum / 5); return start <= end ? { level: index + 1, label: start === end ? `${start}` : `${start}–${end}` } : null; }).filter(Boolean); }, [view.maximum]);
  const roleCopy = user?.rol === "gerencia_general" ? { eyebrow: "Vista corporativa", subtitle: tiendaId ? `Afluencia de ${scopeName || "la tienda seleccionada"}` : "Afluencia consolidada de todas las tiendas" } : user?.rol === "jefe_zonal" ? { eyebrow: "Control zonal", subtitle: `Afluencia diaria de ${scopeName || "la tienda seleccionada"}` } : { eyebrow: "Operación de tienda", subtitle: "Afluencia diaria de clientes en tu sede" };
  return <section className={`traffic-matrix-card ${expanded ? "is-expanded" : ""}`}>
    <header className="traffic-matrix-head"><div><span className="traffic-matrix-eyebrow"><Activity size={14} />{roleCopy.eyebrow}</span><h2>Matriz de tráfico por hora</h2><p>{roleCopy.subtitle}. La intensidad del color permite detectar rápidamente los periodos de mayor demanda.</p></div><div className="traffic-matrix-actions"><button type="button" onClick={load} aria-label="Actualizar matriz"><RefreshCw size={17} className={loading ? "is-spinning" : ""} /></button><button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Cerrar vista ampliada" : "Ampliar matriz"}>{expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>{expanded && <button type="button" onClick={() => setExpanded(false)} aria-label="Cerrar"><X size={19} /></button>}</div></header>
    <div className="traffic-matrix-kpis"><span><UsersRound size={18} /><small>Visitas registradas</small><strong>{view.total.toLocaleString("es-PE")}</strong></span><span><Activity size={18} /><small>Hora de mayor tráfico</small><strong>{view.total ? rangeLabel(view.peak) : "Sin datos"}</strong></span><span><CalendarDays size={18} /><small>Promedio diario (visitas/día)</small><strong>{(view.total / Math.max(dates.length, 1)).toLocaleString("es-PE", { maximumFractionDigits: 1 })}</strong><small>Entre {dates.length} {dates.length === 1 ? "día" : "días"} del período</small></span></div>
    {error && <div className="traffic-matrix-error">{error}</div>}
    <div className="traffic-matrix-scroll"><div className="traffic-matrix-grid" style={{ gridTemplateColumns: `minmax(116px, 1.35fr) repeat(${HOURS.length}, minmax(58px, 1fr)) minmax(74px, .8fr)` }}><div className="traffic-matrix-corner">Día / hora</div>{HOURS.map((hour) => <div className="traffic-matrix-hour" key={hour}>{hour.slice(0, 5)}</div>)}<div className="traffic-matrix-hour">Total</div>{view.rows.map((row) => <div className="traffic-matrix-row" key={row.date} style={{ display: "contents" }}><div className="traffic-matrix-date"><strong>{shortDate(row.date)}</strong><small>{row.date}</small></div>{row.cells.map((cell) => <div key={cell.hour} className={`traffic-matrix-cell ${cell.value ? "has-value" : ""}`} style={{ "--heat": view.maximum ? Math.ceil(cell.value / view.maximum * 5) / 5 : 0 }} title={`${shortDate(row.date)}, ${rangeLabel(cell.hour)}: ${cell.value} visitas`}><strong>{cell.value || "—"}</strong></div>)}<div className="traffic-matrix-total">{row.total.toLocaleString("es-PE")}</div></div>)}</div></div>
    <footer className="traffic-matrix-legend"><span>Menor tráfico</span><div className="traffic-matrix-legend-ranges">{colorRanges.length ? colorRanges.map((range) => <span key={range.level}><i style={{ "--legend-heat": range.level / 5 }} />{range.label}</span>) : <span>Sin registros</span>}</div><span>Mayor tráfico</span><small>{loading ? "Actualizando…" : `Actualizado ${new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`}</small></footer>
  </section>;
}
