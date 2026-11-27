import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RefreshCw } from "lucide-react";
import { api, todayISO } from "../lib/api";
import { watchTrafficUpdates } from "../lib/trafficRefresh";
import { Loading, Notice } from "../components/UI";
import "./marketing-traffic-chart.css";

const number = value => Number(value).toLocaleString("es-PE");
const monthLabel = month => new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));

export default function MarketingTrafficChart({ stores }) {
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [storeId, setStoreId] = useState("");
  const [compareId, setCompareId] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh(value => value + 1), []);
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const maxMonth = year === Number(today.slice(0, 4)) ? Number(today.slice(5, 7)) : 12;
  const primaryName = stores.find(store => String(store.id) === storeId)?.nombre || "Todas las tiendas";
  const secondaryName = stores.find(store => String(store.id) === compareId)?.nombre || "Otra tienda";
  useEffect(() => watchTrafficUpdates(reload), [reload]);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setError("");
    const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    const end = `${month}-${String(last).padStart(2, "0")}`;
    const hasta = end > today ? today : end;
    api(`/trafico/matriz?desde=${month}-01&hasta=${hasta}`, { signal: controller.signal, cache: "no-store" })
      .then(data => { if (!controller.signal.aborted) setResult(data); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [month, today, refresh]);
  const rows = useMemo(() => {
    const days = new Date(year, monthNumber, 0).getDate();
    const totals = new Map(Array.from({ length: days }, (_, index) => {
      const date = `${month}-${String(index + 1).padStart(2, '0')}`;
      return [date, { date, day: index + 1, primary: null, secondary: null }];
    }));
    const allowed = new Set(stores.map(store => String(store.id)));
    for (const row of result?.registros || []) {
      const day = totals.get(row.fecha);
      const id = String(row.tienda_id);
      if (!day || !allowed.has(id)) continue;
      const value = Number(row.cantidad) || 0;
      if (!storeId || id === storeId) day.primary = (day.primary ?? 0) + value;
      if (compareId && id === compareId) day.secondary = (day.secondary ?? 0) + value;
    }
    return [...totals.values()];
  }, [stores, result, storeId, compareId, month, year, monthNumber]);
  const total = key => rows.reduce((sum, row) => sum + (row[key] ?? 0), 0);
  const dayCount = key => rows.filter(row => row[key] !== null).length;
  const label = value => value == null ? "" : number(value);
  return <section className="panel marketing-traffic-chart" aria-label="Tráfico diario por tienda">
    <header className="panel__header"><div><h2>Tráfico por día · {monthLabel(month)}</h2><p>Una barra por día; añade otra tienda para comparar sus visitantes.</p></div>
      <button type="button" className="icon-button" aria-label="Actualizar gráfico de tráfico" onClick={reload}><RefreshCw size={18}/></button>
    </header>
    <div className="marketing-traffic-chart__filters">
      <label>Mes<input aria-label="Mes del gráfico de tráfico" type="month" required max={today.slice(0, 7)} value={month} onChange={event => { if (event.target.value) setMonth(event.target.value); }}/></label>
      <label>Tienda<select aria-label="Tienda del gráfico de tráfico" value={storeId} onChange={event => { setStoreId(event.target.value); if (!event.target.value || event.target.value === compareId) setCompareId(""); }}>
        <option value="">Todas las tiendas</option>{stores.map(store => <option key={store.id} value={store.id}>{store.nombre}</option>)}
      </select></label>
      <label>Comparar con<select aria-label="Comparar tráfico con otra tienda" disabled={!storeId} value={compareId} onChange={event => setCompareId(event.target.value)}>
        <option value="">{storeId ? "Selecciona otra tienda" : "Selecciona primero una tienda"}</option>{stores.filter(store => String(store.id) !== storeId).map(store => <option key={store.id} value={store.id}>{store.nombre}</option>)}
      </select></label>
    </div>
    <div className="marketing-traffic-chart__months"><label><span>Recorrer meses de {year} · {monthLabel(month)}</span><input type="range" aria-label="Deslizar meses del gráfico" min="1" max={maxMonth} step="1" value={monthNumber} onChange={event => setMonth(`${year}-${String(event.target.value).padStart(2, '0')}`)}/><span className="marketing-traffic-chart__month-ends"><span>Enero</span><span>{monthLabel(`${year}-${String(maxMonth).padStart(2, '0')}`)}</span></span></label></div>
    {error ? <Notice type="error">{error}<button type="button" className="button button--ghost" onClick={reload}>Reintentar</button></Notice> : !result ? <Loading/> : <>
      <p className="marketing-traffic-chart__summary">{primaryName}: <strong>{number(total('primary'))} visitantes</strong> · {dayCount('primary')} días con registros.
        {compareId && <><br/>{secondaryName}: <strong>{number(total('secondary'))} visitantes</strong> · {dayCount('secondary')} días con registros.</>}
      </p>
      <div className="marketing-traffic-chart__legend"><span><i style={{ background: '#245b91' }}/>{primaryName}</span>{compareId && <span><i style={{ background: '#d17831' }}/>{secondaryName}</span>}</div>
      <div className="marketing-traffic-chart__scroll" role="region" aria-label="Barras verticales de visitantes por día" tabIndex={0}>
        <div style={{ height: 380, minWidth: Math.max(760, rows.length * (compareId ? 76 : 48)) }}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{ top: 30, right: 25, left: 12, bottom: 14 }} accessibilityLayer>
            <CartesianGrid stroke="#dce4ed" vertical={false}/><XAxis dataKey="day" interval={0} tick={{ fontSize: 12 }} label={{ value: 'Día del mes', position: 'insideBottom', offset: -8 }}/><YAxis allowDecimals={false} tickFormatter={number} width={65}/>
            <Tooltip filterNull={false} formatter={value => value == null ? 'Sin registro' : `${number(value)} visitantes`} labelFormatter={day => `${String(day).padStart(2, '0')}/${String(monthNumber).padStart(2, '0')}/${year}`}/>
            <Bar dataKey="primary" name={primaryName} fill="#245b91" isAnimationActive={false} radius={[4, 4, 0, 0]} maxBarSize={32}><LabelList dataKey="primary" position="top" formatter={label} fontSize={11} fill="#203b56"/></Bar>
            {compareId && <Bar dataKey="secondary" name={secondaryName} fill="#d17831" isAnimationActive={false} radius={[4, 4, 0, 0]} maxBarSize={32}><LabelList dataKey="secondary" position="top" formatter={label} fontSize={11} fill="#8c4817"/></Bar>}
          </BarChart></ResponsiveContainer>
        </div>
      </div>
      <p className="marketing-traffic-chart__summary">Desliza el gráfico horizontalmente para ver todos los días. Los días sin registros no tienen barra; un cero indica un conteo registrado de cero. Los días futuros quedan sin datos.</p>
    </>}
  </section>;
}
