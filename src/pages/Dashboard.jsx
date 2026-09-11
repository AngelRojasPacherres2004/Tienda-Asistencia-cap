import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Building2, CheckCircle2, Clock3, Filter, GraduationCap, RotateCcw, UsersRound, X } from "lucide-react";
import { api, estadoAsistenciaLabels, todayISO } from "../lib/api";
import { Loading, Notice, PageHeader } from "../components/UI";

const palette = { presente: "#2f9e78", tardanza: "#c9932f", medio_turno: "#df9f39", apoyo: "#4f8dc9", falta: "#d9635f", permiso: "#7668ba", descanso_medico: "#8d96a3", suspension: "#a54f4f" };
const exitPalette = ["#d6b56f", "#4f8dc9", "#2f9e78", "#d9635f", "#7668ba", "#df9f39", "#8d96a3", "#3f789f", "#9bb84a", "#c47c36", "#a54f4f", "#6d9e91"];
const tooltipStyle = { color: "#f3eee5", background: "#171719", border: "1px solid rgba(206,169,92,.3)", borderRadius: 12, fontSize: 12 };

function Metric({ icon: Icon, label, value, note, tone }) {
  return <article className={`metric-card metric-card--${tone}`}><div className="metric-card__top"><span><Icon size={20} /></span><small>{label}</small></div><strong>{value ?? 0}</strong><p>{note}</p></article>;
}

function AttendanceTrendPanel({ rows, year }) {
  return <article className="panel panel--wide panel--attendance">
    <header className="panel__header"><div><h2>Ritmo de asistencia · {year}</h2><p>Tasa de presentes por mes</p></div><span className="panel-tag">Año {year}</span></header>
    <div className="chart chart--large"><ResponsiveContainer width="100%" height="100%"><AreaChart data={rows}><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#cda85f" stopOpacity={.32} /><stop offset="100%" stopColor="#cda85f" stopOpacity={.02} /></linearGradient></defs><CartesianGrid stroke="#2a2926" vertical={false} /><XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: "#9f9789", fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "#9f9789", fontSize: 11 }} unit="%" /><Tooltip contentStyle={tooltipStyle} /><Area type="monotone" dataKey="tasa" stroke="#d6b56f" strokeWidth={2.5} fill="url(#trendFill)" /></AreaChart></ResponsiveContainer></div>
  </article>;
}

function StatePeriodPanel({ rows, periodLabel }) {
  const total = rows.reduce((sum, item) => sum + item.cantidad, 0);
  return <article className="panel">
    <header className="panel__header"><div><h2>Estado del periodo</h2><p>Distribución de asistencias</p></div><span className="panel-tag">{periodLabel}</span></header>
    <div className="donut-wrap"><ResponsiveContainer width="100%" height={210}><PieChart><Pie data={rows} dataKey="cantidad" nameKey="estado" innerRadius={60} outerRadius={82} paddingAngle={3}>{rows.map((item) => <Cell key={item.estado} fill={palette[item.estado] || "#8d96a3"} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{total}</strong><small>Total</small></div></div>
    <div className="chart-legend">{rows.map((item) => <span key={item.estado}><i style={{ background: palette[item.estado] }} />{estadoAsistenciaLabels[item.estado] || item.estado}<strong>{item.cantidad}</strong></span>)}</div>
  </article>;
}

function WorkloadPanel({ rows, total, isAdmin, periodLabel }) {
  const orderedRows = [...rows].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));
  return <article className="panel panel--attendance">
    <header className="panel__header"><div><h2>{isAdmin ? "Asistencias por tienda" : "Asistencias por empleado"}</h2><p>Registros del periodo, ordenados de mayor a menor</p></div><span className="panel-tag">{periodLabel}</span></header>
    {!!total && <div className="workload-legend"><span><i className="workload-dot workload-dot--present" />Presentes</span><span><i className="workload-dot workload-dot--other" />Otros estados</span><span><i className="workload-dot workload-dot--absence" />Faltas</span></div>}
    <div className="chart chart--medium"><ResponsiveContainer width="100%" height="100%"><BarChart data={orderedRows} layout="vertical" margin={{ top: 4, right: 30, bottom: 8, left: 8 }} barCategoryGap="25%"><CartesianGrid stroke="#2a2926" horizontal={false} /><XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "#9f9789", fontSize: 10 }} /><YAxis type="category" dataKey="nombre" width={125} axisLine={false} tickLine={false} tick={{ fill: "#b9b0a2", fontSize: 10 }} /><Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(205,169,95,.04)" }} /><Bar name="Presentes" dataKey="presentes" stackId="a" fill="#2f9e78" radius={[5, 0, 0, 5]} /><Bar name="Otros estados" dataKey="otros" stackId="a" fill="#df9f39" /><Bar name="Faltas" dataKey="faltas" stackId="a" fill="#d9635f" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></div>
    {!total && <div className="panel-empty"><CheckCircle2 size={24} /><span>Aún no hay asistencias registradas en {periodLabel.toLowerCase()}.</span></div>}
  </article>;
}

function RotationPanel({ rows, totals, year }) {
  return <article className="panel panel--rotation">
    <header className="panel__header"><div><h2>Rotación de personal · {year}</h2><p>Ingresos, salidas y dotación mensual</p></div><span className="panel-tag">{totals.ingreso} ingresos · {totals.salida} salidas</span></header>
    <div className="rotation-legend"><span><i className="rotation-dot rotation-dot--start" />Personal inicial</span><span><i className="rotation-dot rotation-dot--in" />Ingresos</span><span><i className="rotation-dot rotation-dot--out" />Salidas</span><span><i className="rotation-dot rotation-dot--end" />Personal final</span></div>
    <div className="rotation-table">
      <div className="rotation-table__labels"><span>Mes</span><span>Personal inicial</span><span>Ingresos</span><span>Salidas</span><span>Personal final</span></div>
      {rows.map((item) => {
        const max = Math.max(item.ingreso, item.salida, 1);
        return <div className="rotation-row" key={`${item.anio}-${item.mes}`}>
          <strong>{item.mes}</strong>
          <span className="rotation-count rotation-count--start">{item.personal_inicio}</span>
          <div className="rotation-track">{item.ingreso > 0 ? <span className="rotation-bar rotation-bar--in" style={{ width: `${Math.max(8, (item.ingreso / max) * 100)}%` }}><b>{item.ingreso}</b></span> : <b className="rotation-zero">0</b>}</div>
          <div className="rotation-track">{item.salida > 0 ? <span className="rotation-bar rotation-bar--out" style={{ width: `${Math.max(8, (item.salida / max) * 100)}%` }}><b>{item.salida}</b></span> : <b className="rotation-zero">0</b>}</div>
          <span className="rotation-count rotation-count--end">{item.personal_fin}</span>
        </div>;
      })}
    </div>
  </article>;
}

function ExitReasonsPanel({ rows, year }) {
  const total = rows.reduce((sum, item) => sum + item.cantidad, 0);
  return <article className="panel panel--exit-reasons">
    <header className="panel__header"><div><h2>Motivos de salida del personal · {year}</h2><p>Distribución de salidas registradas</p></div><span className="panel-tag">{total} salidas</span></header>
    {total ? <div className="exit-reasons-content">
      <div className="donut-wrap exit-reasons-donut"><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={rows} dataKey="cantidad" nameKey="motivo" innerRadius={65} outerRadius={88} paddingAngle={2}>{rows.map((item, index) => <Cell key={item.motivo} fill={exitPalette[index % exitPalette.length]} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{total}</strong><small>Salidas</small></div></div>
      <div className="exit-reasons-legend">{rows.map((item, index) => <span key={item.motivo}><i style={{ background: exitPalette[index % exitPalette.length] }} /><em>{item.motivo}</em><strong>{item.cantidad}</strong></span>)}</div>
    </div> : <div className="panel-empty"><CheckCircle2 size={24} /><span>No hay salidas registradas en {year}.</span></div>}
  </article>;
}

export default function Dashboard({ user }) {
  const isAdmin = user?.rol === "admin";
  const today = todayISO();
  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);
  const [data, setData] = useState(null);
  const [tiendas, setTiendas] = useState([]);
  const [filters, setFilters] = useState({ tienda_id: "", anio: currentYear, mes: today.slice(5, 7), dia: "" });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const yearOptions = Array.from({ length: Number(currentYear) - 1999 }, (_, index) => String(Number(currentYear) - index));
  const monthOptions = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const daysInSelectedMonth = new Date(Number(filters.anio), Number(filters.mes), 0).getDate();
  useEffect(() => { if (isAdmin) api("/tiendas").then(setTiendas).catch(() => {}); }, [isAdmin]);
  const selectedRange = useMemo(() => {
    const prefix = `${filters.anio}-${filters.mes}`;
    if (filters.dia) {
      const date = `${prefix}-${filters.dia}`;
      return { desde: date, hasta: date };
    }
    const lastDay = new Date(Number(filters.anio), Number(filters.mes), 0).getDate();
    return { desde: `${prefix}-01`, hasta: prefix === currentMonth ? today : `${prefix}-${String(lastDay).padStart(2, "0")}` };
  }, [filters.dia, filters.anio, filters.mes, currentMonth, today]);
  useEffect(() => {
    const currentRequest = ++requestId.current;
    const controller = new AbortController();
    setRefreshing(true); setError("");
    const params = new URLSearchParams({ ...selectedRange, rotation_year: filters.anio, ...(filters.tienda_id ? { tienda_id: filters.tienda_id } : {}) });
    api(`/dashboard?${params}`, { signal: controller.signal })
      .then((nextData) => { if (currentRequest === requestId.current) setData(nextData); })
      .catch((err) => { if (err.name !== "AbortError" && currentRequest === requestId.current) setError(err.message); })
      .finally(() => { if (currentRequest === requestId.current) setRefreshing(false); });
    return () => controller.abort();
  }, [filters.tienda_id, filters.anio, selectedRange]);
  if (!data) return <Loading />;
  const selectedStore = tiendas.find((item) => String(item.id) === String(filters.tienda_id));
  const periodLabel = filters.dia
    ? `${Number(filters.dia)} de ${monthOptions[Number(filters.mes) - 1]} de ${filters.anio}`
    : `${monthOptions[Number(filters.mes) - 1]} de ${filters.anio}`;
  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));
  const resetFilters = () => setFilters({ tienda_id: "", anio: currentYear, mes: today.slice(5, 7), dia: "" });
  const workloadTotal = data.workload.reduce((sum, item) => sum + item.total, 0);
  const rotationTotals = data.rotation.reduce((totals, item) => ({ ingreso: totals.ingreso + item.ingreso, salida: totals.salida + item.salida }), { ingreso: 0, salida: 0 });
  return <>
    <PageHeader eyebrow="Centro de control" title="Buenos dias" subtitle="Una lectura clara de lo que esta ocurriendo hoy." />
    {error && <Notice type="error" onClose={() => setError("")}>{error}</Notice>}
    {isAdmin && <button className={`dashboard-filter-fab ${filtersOpen ? "open" : ""}`} onClick={() => setFiltersOpen((open) => !open)}><Filter size={17} /><span>{filtersOpen ? "Ocultar" : "Filtros"}</span></button>}
    {isAdmin && filtersOpen && <aside className="dashboard-filter-popover"><div className="dashboard-filter-popover__head"><div><span className="eyebrow">Vista global</span><h2>Periodo y tienda</h2><small>{selectedStore ? selectedStore.nombre : "Todas las tiendas"}</small></div><button className="icon-button" onClick={() => setFiltersOpen(false)} aria-label="Cerrar filtros"><X size={17} /></button></div><label className="field"><span>Tienda</span><select value={filters.tienda_id} onChange={(e) => updateFilter("tienda_id", e.target.value)}><option value="">Todas las tiendas</option>{tiendas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></label><div className="dashboard-filter-selectors"><label className="field"><span>Año</span><select value={filters.anio} onChange={(e) => setFilters((current) => ({ ...current, anio: e.target.value, dia: "" }))}>{yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select></label><label className="field"><span>Mes</span><select value={filters.mes} onChange={(e) => setFilters((current) => ({ ...current, mes: e.target.value, dia: "" }))}>{monthOptions.map((month, index) => <option key={month} value={String(index + 1).padStart(2, "0")}>{month}</option>)}</select></label><label className="field"><span>Día</span><select value={filters.dia} onChange={(e) => updateFilter("dia", e.target.value)}><option value="">Todo el mes</option>{Array.from({ length: daysInSelectedMonth }, (_, index) => String(index + 1).padStart(2, "0")).map((day) => <option key={day} value={day}>{Number(day)}</option>)}</select></label></div><small className="dashboard-filter-summary">Desde {selectedRange.desde} hasta {selectedRange.hasta}</small><button className="button button--ghost button--small" onClick={resetFilters}><RotateCcw size={14} />Mes actual</button></aside>}
    <div className={`dashboard-live-data ${refreshing ? "is-refreshing" : ""}`} aria-busy={refreshing}>
    {refreshing && <span className="dashboard-refresh-indicator"><i />Actualizando datos…</span>}
    <section className="metrics-grid">{isAdmin && <Metric icon={Building2} label="Tiendas" value={data.summary.tiendas_activas} note="Activas" tone="violet" />}<Metric icon={UsersRound} label={isAdmin ? "Equipo activo" : "Mi equipo"} value={data.summary.usuarios_activos} note="Usuarios habilitados" tone="blue" /><Metric icon={CheckCircle2} label="Presentes hoy" value={data.summary.asistencias_hoy} note="Registrados como presente" tone="green" /><Metric icon={Clock3} label="Asistencia del periodo" value={`${data.summary.tasa_asistencia_mes}%`} note="Tasa de presentes" tone="amber" /><Metric icon={GraduationCap} label="Capacitaciones" value={data.summary.cursos_en_curso} note="En curso" tone="red" /></section>
    <section className="dashboard-grid">
      <AttendanceTrendPanel rows={data.trend} year={filters.anio} />
      <StatePeriodPanel rows={data.states} periodLabel={periodLabel} />
      <WorkloadPanel rows={data.workload} total={workloadTotal} isAdmin={isAdmin} periodLabel={periodLabel} />
      <section className="rotation-dashboard-grid">
        <RotationPanel rows={data.rotation} totals={rotationTotals} year={filters.anio} />
        <ExitReasonsPanel rows={data.exitReasons || []} year={filters.anio} />
      </section>
      <article className="panel"><header className="panel__header"><div><h2>Progreso de capacitaciones</h2><p>Cursos con mas pendientes</p></div></header><div className="due-list">{data.progresoCursos.length ? data.progresoCursos.map((item, index) => { const total = item.completados + item.en_curso + item.pendientes; const porcentaje = total ? Math.round((item.completados / total) * 100) : 0; return <div key={`${item.titulo}-${index}`}><span className={`due-days ${item.pendientes > 0 ? "urgent" : ""}`}>{porcentaje}%</span><div><strong>{item.titulo}</strong><small>{item.completados} completados · {item.en_curso} en curso · {item.pendientes} pendientes</small></div></div>; }) : <div className="panel-empty"><CheckCircle2 size={24} /><span>Todavia no hay cursos en el catalogo.</span></div>}</div></article>
    </section>
    </div>
  </>;
}
