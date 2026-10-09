import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Building2, CheckCircle2, Clock3, Filter, GraduationCap, Maximize2, Minimize2, RotateCcw, UsersRound, X } from "lucide-react";
import { api, estadoAsistenciaLabels, formatDate, todayISO } from "../lib/api";
import { Loading, Notice, PageHeader } from "../components/UI";
import TrafficHourMatrix from "../components/TrafficHourMatrix";
import AttendanceOverviewMatrix from "../components/AttendanceOverviewMatrix";
import GeneralManagementOverview from "../components/GeneralManagementOverview";

const palette = { presente: "#2f9e78", tardanza: "#c9932f", medio_turno: "#df9f39", apoyo: "#4f8dc9", falta: "#d9635f", permiso: "#7668ba", descanso_medico: "#8d96a3", suspension: "#a54f4f" };
const tooltipStyle = { color: "#f3eee5", background: "#171719", border: "1px solid rgba(206,169,92,.3)", borderRadius: 12, fontSize: 12 };

function Metric({ icon: Icon, label, value, note, tone }) {
  return <article className={`metric-card metric-card--${tone}`}><div className="metric-card__top"><span><Icon size={20} /></span><small>{label}</small></div><strong>{value ?? 0}</strong><p>{note}</p></article>;
}

function AttendanceTrendPanel({ rows, year }) {
  return <article className="panel panel--wide panel--attendance">
    <header className="panel__header"><div><h2>Ritmo de asistencia · {year}</h2><p>Asistentes sobre marcas registradas; meses sin datos quedan vacíos.</p></div><span className="panel-tag">Año {year}</span></header>
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
  return <article className="panel panel--attendance">
    <header className="panel__header"><div><h2>{isAdmin ? "Asistencia por tienda" : "Asistencia por empleado"}</h2><p>Periodo seleccionado</p></div><span className="panel-tag">{periodLabel}</span></header>
    <div className="chart chart--medium"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} barGap={2}><CartesianGrid stroke="#2a2926" vertical={false} /><XAxis dataKey="nombre" axisLine={false} tickLine={false} tick={{ fill: "#9f9789", fontSize: 10 }} /><YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "#9f9789", fontSize: 10 }} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="presentes" stackId="a" fill="#2f9e78" radius={[0, 0, 4, 4]} /><Bar dataKey="otros" stackId="a" fill="#df9f39" /><Bar dataKey="faltas" stackId="a" fill="#d9635f" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
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

function WarningsByWorkerPanel({ data, periodLabel }) {
  const rows = data?.rows || [];
  return <article className="panel dashboard-worker-panel">
    <header className="panel__header"><div><h2>Amonestaciones por trabajador</h2><p>Últimos 8 registros del período seleccionado</p></div><span className="panel-tag">{data?.total || 0} amonestaciones</span></header>
    {rows.length ? <div className="dashboard-worker-table"><div className="dashboard-worker-table__head"><span>Fecha</span><span>Trabajador</span><span>Documento</span></div>{rows.map((row) => <div key={row.id}><span>{formatDate(row.fecha)}</span><strong title={row.trabajador}>{row.trabajador}</strong><span>{row.documento}</span></div>)}</div> : <div className="panel-empty"><CheckCircle2 size={24} /><span>No hay amonestaciones registradas en {periodLabel.toLowerCase()}.</span></div>}
  </article>;
}

function WorkerNameTick({ x, y, payload, fill }) {
  const words = String(payload?.value || "").trim().split(/\s+/);
  const label = words.length > 2 ? `${words[0]} ${words[1]}` : words.join(" ");
  return <text x={x} y={y} dy={4} textAnchor="end" fill={fill} fontSize={11} fontWeight={700}><title>{payload?.value}</title>{label}</text>;
}

function AttendanceByWorkerPanel({ rows, periodLabel, light = false }) {
  const axisColor = light ? "#54708a" : "#9f9789";
  const workerColor = light ? "#173b5b" : "#ddd4c7";
  const totalColor = light ? "#174a75" : "#c8d3de";
  return <article className="panel dashboard-worker-panel dashboard-worker-attendance">
    <header className="panel__header"><div><h2>Asistencia por trabajador</h2><p>Asistencia, tardanza, faltas y otros estados</p></div><span className="panel-tag">{periodLabel}</span></header>
    {rows.length ? <div className="chart dashboard-worker-chart" style={{ height: Math.max(260, rows.length * 31 + 16) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{ top: 8, right: 34, left: 4, bottom: 4 }} barSize={18}><CartesianGrid stroke={light ? "#d4e0e9" : "#2a2926"} horizontal={false} /><XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: axisColor, fontSize: 10 }} /><YAxis type="category" dataKey="nombre" width={142} axisLine={false} tickLine={false} tick={<WorkerNameTick fill={workerColor} />} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="presente" name="Asistencia" stackId="asistencia" fill="#08b947" radius={[3, 0, 0, 3]} /><Bar dataKey="tardanza" name="Tardanza" stackId="asistencia" fill="#f2b33b" /><Bar dataKey="ausencia" name="Faltas" stackId="asistencia" fill="#ef4055" radius={[0, 3, 3, 0]}></Bar><Bar dataKey="otros" name="Permisos, descansos y suspensiones" stackId="asistencia" fill="#8f7ac8"><LabelList dataKey="total" position="right" fill={totalColor} fontSize={11} /></Bar></BarChart></ResponsiveContainer></div> : <div className="panel-empty"><CheckCircle2 size={24} /><span>No hay asistencias registradas en {periodLabel.toLowerCase()}.</span></div>}
    <div className="dashboard-worker-legend"><span><i className="is-present" />Asistencia</span><span><i className="is-late" />Tardanza</span><span><i className="is-absent" />Faltas</span><span><i style={{ background: "#8f7ac8" }} />Permisos, descansos y suspensiones</span></div>
  </article>;
}

export function WorkerInsightsPanels({ warnings, attendance, periodLabel, light = false }) {
  return <><WarningsByWorkerPanel data={warnings} periodLabel={periodLabel} /><AttendanceByWorkerPanel rows={attendance || []} periodLabel={periodLabel} light={light} /></>;
}

export function TrainingDevelopmentPanel({ rows }) {
  const [course, setCourse] = useState(""); const [status, setStatus] = useState("todos");
  const filtered = rows.filter((row) => (!course || row.titulo === course) && (status === "todos" || row[status] > 0));
  const total = filtered.reduce((sum, row) => sum + row.completados + row.en_curso + row.pendientes, 0);
  const completed = filtered.reduce((sum, row) => sum + row.completados, 0);
  return <section className="training-development"><header><div><span>Desarrollo</span><h2>Capacitación y desarrollo</h2></div><p>Estado actual de los cursos asignados al personal activo de las tiendas seleccionadas.</p></header><div className="training-development-filters"><label>Curso<select value={course} onChange={(event) => setCourse(event.target.value)}><option value="">Todos</option>{rows.map((row) => <option key={row.curso_id || row.titulo} value={row.titulo}>{row.titulo}</option>)}</select></label><label>Estado<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="todos">Todos</option><option value="completados">Completado</option><option value="en_curso">En curso</option><option value="pendientes">Pendiente</option></select></label></div><div className="training-development-grid"><article><header><h3>Avance actual de capacitaciones</h3><strong>{total ? Math.round(completed * 100 / total) : 0}% completado</strong></header><div className="training-development-legend"><span><i />Completado</span><span><i />Pendiente / en curso</span></div><div className="training-development-bars">{filtered.map((row) => { const count = row.completados + row.en_curso + row.pendientes; const done = count ? row.completados * 100 / count : 0; return <div key={row.curso_id || row.titulo}><strong title={row.titulo}>{row.titulo}</strong><span><i style={{ width: `${done}%` }} /><b>{row.completados}/{count}</b></span></div>; })}</div></article><article><header><h3>Estado actual de asignaciones</h3><strong>{total} asignaciones</strong></header><div className="training-history"><div className="training-history-head"><span>Curso</span><span>Completado</span><span>En curso</span><span>Pendiente</span></div>{filtered.map((row) => <div key={row.curso_id || row.titulo}><strong>{row.titulo}</strong><span>{row.completados}</span><span>{row.en_curso}</span><span>{row.pendientes}</span></div>)}</div></article></div></section>;
}

function ErrorsByResponsiblePanel({ rows, periodLabel }) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState(null);
  const maximum = Math.max(...rows.map((item) => item.value), 1);

  useEffect(() => {
    if (!expanded && !selected) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      if (selected) setSelected(null);
      else setExpanded(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [expanded, selected]);

  return <>
    <article className={`panel dashboard-error-panel ${expanded ? "dashboard-card--expanded" : ""}`}>
      <header className="panel__header"><div><span className="dashboard-section-kicker">Calidad operativa</span><h2>Errores por Usuario o Área · {periodLabel}</h2><p>Errores agrupados por la persona responsable y su categoría.</p></div><div className="dashboard-card-tools"><span className="panel-tag">{rows.reduce((sum, item) => sum + item.value, 0)} errores</span><button className="icon-button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Cerrar vista ampliada" : "Ampliar gráfica"}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div></header>
      {rows.length ? <div className="dashboard-horizontal-bars">
        {rows.map((item, index) => <button key={item.id} className="dashboard-horizontal-bar" onClick={() => setSelected(item)} title="Haz clic para ver el detalle">
          <span className="dashboard-horizontal-rank">{String(index + 1).padStart(2, "0")}</span>
          <span className="dashboard-horizontal-label"><strong>{item.name}</strong><small>{item.area}</small></span>
          <span className="dashboard-horizontal-track"><i style={{ width: `${(item.value / maximum) * 100}%`, "--bar-index": index }} /></span>
          <strong className="dashboard-horizontal-value">{item.value}</strong>
        </button>)}
      </div> : <div className="panel-empty dashboard-error-empty"><CheckCircle2 size={24} /><span>No hay errores registrados en {periodLabel.toLowerCase()}.</span></div>}
    </article>
    {selected && <div className="dashboard-detail-modal" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section><header><div><span className="dashboard-section-kicker">{selected.area}</span><h2>{selected.name}</h2><p>{selected.value} error(es) en {periodLabel.toLowerCase()}</p></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Cerrar"><X size={17} /></button></header><div className="dashboard-error-detail-list">{selected.rows.map((row) => <article key={row.id}><span><AlertTriangle size={15} /></span><div><strong>{row.categoria}</strong><p>{row.descripcion}</p><small>{row.tienda} · {formatDate(row.fecha)}{row.accion_correctiva ? ` · Acción: ${row.accion_correctiva}` : ""}</small></div></article>)}</div></section></div>}
  </>;
}

export default function Dashboard({ user }) {
  const isAdmin = ["gerencia_general", "gerente_comercial", "coach", "jefe_zonal"].includes(user?.rol);
  const today = todayISO();
  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);
  const [data, setData] = useState(null);
  const [generalComparison, setGeneralComparison] = useState(null);
  const [comparisonError, setComparisonError] = useState("");
  const [tiendas, setTiendas] = useState([]);
  const [filters, setFilters] = useState({ tienda_id: "", anio: currentYear, mes: today.slice(5, 7), dia: "" });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [error, setError] = useState("");
  const yearOptions = Array.from({ length: Number(currentYear) - 1999 }, (_, index) => String(Number(currentYear) - index));
  const monthOptions = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const availableMonths = filters.anio === currentYear ? monthOptions.slice(0, Number(today.slice(5, 7))) : monthOptions;
  const daysInSelectedMonth = filters.anio === currentYear && filters.mes === today.slice(5, 7) ? Number(today.slice(8, 10)) : new Date(Number(filters.anio), Number(filters.mes), 0).getDate();
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
    let active = true;
    setData(null); setError("");
    const params = new URLSearchParams({ ...selectedRange, rotation_year: filters.anio, ...(filters.tienda_id ? { tienda_id: filters.tienda_id } : {}) });
    api(`/dashboard?${params}`).then(result => { if (active) setData(result); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [filters.tienda_id, filters.anio, selectedRange]);
  useEffect(() => {
    if (user?.rol !== "gerencia_general" || filters.tienda_id) return undefined;
    let active = true;
    setGeneralComparison(null); setComparisonError("");
    const params = new URLSearchParams({ fecha: selectedRange.hasta, ...selectedRange });
    api(`/gerencia/comparativa?${params}`).then((result) => { if (active) setGeneralComparison(result); }).catch((err) => { if (active) setComparisonError(err.message); });
    return () => { active = false; };
  }, [user?.rol, filters.tienda_id, selectedRange]);
  if (error) return <Notice type="error">{error}</Notice>;
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
    <PageHeader eyebrow={user?.rol === "gerencia_general" ? "Gerencia general" : "Centro de control"} title={user?.rol === "gerencia_general" ? "Resumen general" : "Buenos días"} subtitle={user?.rol === "gerencia_general" ? "Una vista ejecutiva de tiendas, equipos y resultados operativos." : "Una lectura clara de lo que está ocurriendo hoy."} />
    {isAdmin && <button className={`dashboard-filter-fab ${filtersOpen ? "open" : ""}`} onClick={() => setFiltersOpen((open) => !open)}><Filter size={17} /><span>{filtersOpen ? "Ocultar" : "Filtros"}</span></button>}
    {isAdmin && filtersOpen && <aside className="dashboard-filter-popover"><div className="dashboard-filter-popover__head"><div><span className="eyebrow">Vista global</span><h2>Periodo y tienda</h2><small>{selectedStore ? selectedStore.nombre : "Todas las tiendas"}</small></div><button className="icon-button" onClick={() => setFiltersOpen(false)} aria-label="Cerrar filtros"><X size={17} /></button></div><label className="field"><span>Tienda</span><select value={filters.tienda_id} onChange={(e) => updateFilter("tienda_id", e.target.value)}><option value="">Todas las tiendas</option>{tiendas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></label><div className="dashboard-filter-selectors"><label className="field"><span>Año</span><select value={filters.anio} onChange={(e) => setFilters((current) => ({ ...current, anio: e.target.value, mes: e.target.value === currentYear && Number(current.mes) > Number(today.slice(5, 7)) ? today.slice(5, 7) : current.mes, dia: "" }))}>{yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select></label><label className="field"><span>Mes</span><select value={filters.mes} onChange={(e) => setFilters((current) => ({ ...current, mes: e.target.value, dia: "" }))}>{availableMonths.map((month, index) => <option key={month} value={String(index + 1).padStart(2, "0")}>{month}</option>)}</select></label><label className="field"><span>Día</span><select value={filters.dia} onChange={(e) => updateFilter("dia", e.target.value)}><option value="">Todo el mes</option>{Array.from({ length: daysInSelectedMonth }, (_, index) => String(index + 1).padStart(2, "0")).map((day) => <option key={day} value={day}>{Number(day)}</option>)}</select></label></div><small className="dashboard-filter-summary">Desde {selectedRange.desde} hasta {selectedRange.hasta}</small><button className="button button--ghost button--small" onClick={resetFilters}><RotateCcw size={14} />Mes actual</button></aside>}
    {user?.rol === "gerencia_general" && !filters.tienda_id && (comparisonError ? <Notice type="error">No se pudo cargar la comparación: {comparisonError}</Notice> : generalComparison ? <GeneralManagementOverview data={generalComparison} periodLabel={periodLabel} /> : <Loading label="Comparando clústeres y tiendas…" />)}
    <section className="metrics-grid">{isAdmin && <Metric icon={Building2} label="Tiendas" value={data.summary.tiendas_activas} note="Activas" tone="violet" />}<Metric icon={UsersRound} label={isAdmin ? "Equipo activo" : "Mi equipo"} value={data.summary.usuarios_activos} note="Personal activo de tiendas" tone="blue" /><Metric icon={CheckCircle2} label={user?.rol === "gerencia_general" ? "Asistentes al cierre" : "Presentes hoy"} value={data.summary.asistencias_hoy} note={user?.rol === "gerencia_general" ? selectedRange.hasta : "Registrados como presente"} tone="green" /><Metric icon={Clock3} label="Asistencia del periodo" value={data.summary.tasa_asistencia_mes == null ? "Sin registros" : `${data.summary.tasa_asistencia_mes}%`} note="Sobre marcas registradas" tone="amber" /><Metric icon={GraduationCap} label="Capacitaciones" value={data.summary.cursos_en_curso} note="En curso" tone="red" /></section>
    {user?.rol === "gerencia_general" && <div className="management-dashboard-section"><div className="dashboard-section-heading"><span className="eyebrow">Personas y afluencia</span><h2>Lectura operativa</h2><p>Asistencia mensual y tráfico del período seleccionado para {selectedStore?.nombre || "todas las tiendas"}.</p></div><AttendanceOverviewMatrix tiendaId={filters.tienda_id} scopeName={selectedStore?.nombre || "Todas las tiendas"} selectedMonth={`${filters.anio}-${filters.mes}`} activeStoresOnly onMonthChange={(value) => setFilters((current) => ({ ...current, anio: value.slice(0, 4), mes: value.slice(5, 7), dia: "" }))}/><TrafficHourMatrix user={user} tiendaId={filters.tienda_id} scopeName={selectedStore?.nombre} period={{ year: filters.anio, monthNumber: filters.mes, day: filters.dia }} comparisonStores={tiendas.filter((store) => store.estado === "activo")} /></div>}
    <TrainingDevelopmentPanel rows={data.progresoCursos || []} year={filters.anio} />
    <section className="dashboard-grid">
      <AttendanceTrendPanel rows={data.trend} year={filters.anio} />
      <StatePeriodPanel rows={data.states} periodLabel={periodLabel} />
      <WorkloadPanel rows={data.workload} total={workloadTotal} isAdmin={Array.isArray(data.filters.tienda_id) || !data.filters.tienda_id} periodLabel={periodLabel} />
      <RotationPanel rows={data.rotation} totals={rotationTotals} year={filters.anio} />
      <WorkerInsightsPanels warnings={data.warningsByWorker} attendance={data.attendanceByWorker} periodLabel={periodLabel} />
      <ErrorsByResponsiblePanel rows={data.errorsByResponsible || []} periodLabel={periodLabel} />
      <article className="panel"><header className="panel__header"><div><h2>Progreso de capacitaciones</h2><p>Capacitaciones con más pendientes</p></div></header><div className="due-list">{data.progresoCursos.length ? data.progresoCursos.map((item, index) => { const total = item.completados + item.en_curso + item.pendientes; const porcentaje = total ? Math.round((item.completados / total) * 100) : 0; return <div key={`${item.titulo}-${index}`}><span className={`due-days ${item.pendientes > 0 ? "urgent" : ""}`}>{porcentaje}%</span><div><strong>{item.titulo}</strong><small>{item.completados} completados · {item.en_curso} en curso · {item.pendientes} pendientes</small></div></div>; }) : <div className="panel-empty"><CheckCircle2 size={24} /><span>Todavía no hay capacitaciones en el catálogo.</span></div>}</div></article>
    </section>
  </>;
}
