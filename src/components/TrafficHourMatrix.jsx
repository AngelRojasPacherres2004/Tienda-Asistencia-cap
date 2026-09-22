import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CalendarDays, Maximize2, Minimize2, RefreshCw, Store, UsersRound, X } from "lucide-react";
import { api } from "../lib/api";

const HOURS = Array.from({ length: 13 }, (_, index) => {
  const start = index + 9;
  return `${String(start).padStart(2, "0")}:00-${String(start + 1).padStart(2, "0")}:00`;
});
const isoDate = (date) => date.toISOString().slice(0, 10);
const daysAgo = (days) => { const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - days); return isoDate(date); };
const shortDate = (value) => new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`));
const rangeLabel = (range) => range.replaceAll(":00", "h").replace("-", "–");

export default function TrafficHourMatrix({ user, tiendaId = "", scopeName = "" }) {
  const [days, setDays] = useState(7); const [data, setData] = useState(null); const [error, setError] = useState("");
  const [loading, setLoading] = useState(false); const [expanded, setExpanded] = useState(false);
  const desde = daysAgo(days - 1); const hasta = isoDate(new Date());
  const load = useCallback(() => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ desde, hasta, ...(tiendaId ? { tienda_id: tiendaId } : {}) });
    api(`/trafico/matriz?${params}`).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [desde, hasta, tiendaId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!expanded) return undefined;
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    const close = (event) => event.key === "Escape" && setExpanded(false); window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [expanded]);
  const view = useMemo(() => {
    const dates = Array.from({ length: days }, (_, index) => daysAgo(index)); const values = new Map(); const stores = new Set();
    for (const row of data?.registros || []) { const key = `${row.fecha}|${row.rango_hora}`; values.set(key, (values.get(key) || 0) + Number(row.cantidad || 0)); stores.add(row.tienda_id); }
    let maximum = 0; let total = 0; let peak = HOURS[0]; let peakTotal = -1;
    HOURS.forEach((hour) => { const value = dates.reduce((sum, date) => sum + (values.get(`${date}|${hour}`) || 0), 0); if (value > peakTotal) { peakTotal = value; peak = hour; } });
    const rows = dates.map((date) => { const cells = HOURS.map((hour) => { const value = values.get(`${date}|${hour}`) || 0; maximum = Math.max(maximum, value); total += value; return { hour, value }; }); return { date, cells, total: cells.reduce((sum, cell) => sum + cell.value, 0) }; });
    return { rows, maximum, total, peak, stores: stores.size };
  }, [data, days]);
  const roleCopy = user?.rol === "gerencia_general"
    ? { eyebrow: "Vista corporativa", subtitle: tiendaId ? `Afluencia de ${scopeName || "la tienda seleccionada"}` : "Afluencia consolidada de todas las tiendas" }
    : user?.rol === "jefe_zonal" ? { eyebrow: "Control zonal", subtitle: `Afluencia diaria de ${scopeName || "la tienda seleccionada"}` }
      : { eyebrow: "Operación de tienda", subtitle: "Afluencia diaria de clientes en tu sede" };
  return <section className={`traffic-matrix-card ${expanded ? "is-expanded" : ""}`}>
    <header className="traffic-matrix-head"><div><span className="traffic-matrix-eyebrow"><Activity size={14} />{roleCopy.eyebrow}</span><h2>Matriz de tráfico por hora</h2><p>{roleCopy.subtitle}. La intensidad del color permite detectar rápidamente los periodos de mayor demanda.</p></div><div className="traffic-matrix-actions"><label><span>Periodo</span><select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>7 días</option><option value={14}>14 días</option><option value={30}>30 días</option></select></label><button type="button" onClick={load} aria-label="Actualizar matriz"><RefreshCw size={17} className={loading ? "is-spinning" : ""} /></button><button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Cerrar vista ampliada" : "Ampliar matriz"}>{expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>{expanded && <button type="button" onClick={() => setExpanded(false)} aria-label="Cerrar"><X size={19} /></button>}</div></header>
    <div className="traffic-matrix-kpis"><span><UsersRound size={18} /><small>Visitas registradas</small><strong>{view.total.toLocaleString("es-PE")}</strong></span><span><Activity size={18} /><small>Hora de mayor tráfico</small><strong>{view.total ? rangeLabel(view.peak) : "Sin datos"}</strong></span><span><CalendarDays size={18} /><small>Promedio diario</small><strong>{Math.round(view.total / days).toLocaleString("es-PE")}</strong></span><span><Store size={18} /><small>Tiendas con registros</small><strong>{view.stores}</strong></span></div>
    {error && <div className="traffic-matrix-error">{error}</div>}
    <div className="traffic-matrix-scroll"><div className="traffic-matrix-grid" style={{ gridTemplateColumns: `minmax(116px, 1.35fr) repeat(${HOURS.length}, minmax(58px, 1fr)) minmax(74px, .8fr)` }}><div className="traffic-matrix-corner">Día / hora</div>{HOURS.map((hour) => <div className="traffic-matrix-hour" key={hour}>{hour.slice(0, 5)}</div>)}<div className="traffic-matrix-hour">Total</div>{view.rows.map((row) => <div className="traffic-matrix-row" key={row.date} style={{ display: "contents" }}><div className="traffic-matrix-date"><strong>{shortDate(row.date)}</strong><small>{row.date}</small></div>{row.cells.map((cell) => <div key={cell.hour} className={`traffic-matrix-cell ${cell.value ? "has-value" : ""}`} style={{ "--heat": view.maximum ? cell.value / view.maximum : 0 }} title={`${shortDate(row.date)}, ${rangeLabel(cell.hour)}: ${cell.value} visitas`}><strong>{cell.value || "—"}</strong></div>)}<div className="traffic-matrix-total">{row.total.toLocaleString("es-PE")}</div></div>)}</div></div>
    <footer className="traffic-matrix-legend"><span>Menor tráfico</span><i /><i /><i /><i /><i /><span>Mayor tráfico</span><small>{loading ? "Actualizando…" : `Actualizado ${new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`}</small></footer>
  </section>;
}
