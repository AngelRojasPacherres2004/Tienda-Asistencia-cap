import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarCheck2, FileClock, Filter, GraduationCap, Maximize2, Minimize2, RefreshCw, RotateCcw, Sun, Users, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, formatDate, todayISO } from "../lib/api";
import { exportExcel } from "../lib/excelExport";
import { Loading, Notice } from "../components/UI";
import TrafficHourMatrix from "../components/TrafficHourMatrix";

export default function MiTienda({ user, onNavigate }) {
  const isZonal = user.rol === "jefe_zonal";
  const [stores, setStores] = useState([]); const [storeId, setStoreId] = useState(isZonal ? "all" : user.tienda_id || "");
  const [zonalAlerts, setZonalAlerts] = useState(null);
  const [profile, setProfile] = useState(null); const [summary, setSummary] = useState(null); const [people, setPeople] = useState([]); const [documents, setDocuments] = useState([]); const [errors, setErrors] = useState([]); const [incidents, setIncidents] = useState([]); const [notice, setNotice] = useState(null);
  const [refreshing, setRefreshing] = useState(false); const [lightMode, setLightMode] = useState(true); const [dashboardKey, setDashboardKey] = useState(0); const dashboardRef = useRef(null); const dashboardRequestId = useRef(0);
  const currentPeriodDate = todayISO();
  const [matrixPeriod, setMatrixPeriod] = useState({ year: currentPeriodDate.slice(0, 4), monthNumber: currentPeriodDate.slice(5, 7), week: "", day: "" });
  useEffect(() => { if (dashboardKey) setMatrixPeriod({ year: currentPeriodDate.slice(0, 4), monthNumber: currentPeriodDate.slice(5, 7), week: "", day: "" }); }, [dashboardKey, currentPeriodDate]);
  const loadDashboard = useCallback(() => {
    if (isZonal && (storeId === "all" || !storeId)) return Promise.resolve();
    const requestId = ++dashboardRequestId.current;
    setRefreshing(true);
    const suffix = isZonal ? `?tienda_id=${storeId}` : "";
    const selectedStore = stores.find((store) => String(store.id) === String(storeId));
    const profileRequest = isZonal ? Promise.resolve({ tienda_nombre: selectedStore?.nombre, tienda_direccion: selectedStore?.direccion, tienda_alquiler_mensual: selectedStore?.alquiler_mensual }) : api("/perfil");
    const peopleRequest = isZonal ? api(`/tiendas/${storeId}/usuarios`) : api("/usuarios");
    return Promise.all([profileRequest, api(`/operaciones/resumen${suffix}`), peopleRequest, api(`/documentos-tienda${suffix}`).catch(() => []), api(`/errores-personal${suffix}`).catch(() => []), api(`/incidencias${suffix}`).catch(() => [])]).then(([p, s, team, docs, errorRows, incidentRows]) => { if (requestId !== dashboardRequestId.current) return; setProfile(p); setSummary(s); setPeople(team); setDocuments(docs); setErrors(errorRows); setIncidents(incidentRows); setNotice(null); }).catch((e) => { if (requestId === dashboardRequestId.current) setNotice({ type: "error", text: e.message }); }).finally(() => { if (requestId === dashboardRequestId.current) setRefreshing(false); });
  }, [isZonal, storeId, stores]);
  useEffect(() => { if (!isZonal) return; api("/tiendas").then((rows) => { setStores(rows); setStoreId((current) => current || rows[0]?.id || ""); }).catch((e) => setNotice({ type: "error", text: e.message })); }, [isZonal]);
  useEffect(() => { if (!isZonal) return; api("/zonal/asistencia").then((attendance) => setZonalAlerts({ attendance })).catch(() => setZonalAlerts(null)); }, [isZonal]);
  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  const changeStore = (value) => { dashboardRequestId.current += 1; setProfile(null); setSummary(null); setNotice(null); setStoreId(value); };
  const refreshDashboard = () => { if (isZonal && storeId === "all") setDashboardKey((value) => value + 1); else loadDashboard(); };
  const toggleFullscreen = async () => { if (document.fullscreenElement) await document.exitFullscreen(); else await dashboardRef.current?.requestFullscreen(); };
  if (isZonal && storeId === "all") return <section ref={dashboardRef} className={`store-dashboard-shell ${lightMode ? "is-light" : ""}`}>
    <div className="store-dashboard-topbar"><div><i /><strong>SUPERVISIÓN ZONAL</strong><span>Comparación entre las tiendas de tu zona</span></div><div><label className="store-dashboard-store-picker"><span>Tienda</span><select value={storeId} onChange={(event) => changeStore(event.target.value)} aria-label="Seleccionar tienda"><option value="all">Todas las tiendas</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.nombre}</option>)}</select></label><button onClick={refreshDashboard}><RefreshCw size={17} />Actualizar datos</button><button onClick={() => setLightMode((value) => !value)}><Sun size={17} />{lightMode ? "Modo claro" : "Modo oscuro"}</button><button onClick={toggleFullscreen}><Maximize2 size={17} />Pantalla completa</button></div></div>
    <header className="store-dashboard-hero"><div><span><Users size={38} /></span><div><h1>COMPARATIVA ZONAL</h1><p>Asistencia, tráfico y alertas de todas las tiendas asignadas</p></div></div></header>
    {notice && <Notice type={notice.type}>{notice.text}</Notice>}
    <ZonalStoreComparison user={user} refreshKey={dashboardKey} onSelectStore={changeStore} />
  </section>;
  if (!profile || !summary) return isZonal ? <section ref={dashboardRef} className={`store-dashboard-shell ${lightMode ? "is-light" : ""}`}><div className="store-dashboard-topbar"><div><i /><strong>SUPERVISIÓN ZONAL</strong></div><div><label className="store-dashboard-store-picker"><span>Tienda</span><select value={storeId} onChange={(event) => changeStore(event.target.value)} aria-label="Seleccionar tienda"><option value="all">Todas las tiendas</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.nombre}</option>)}</select></label></div></div><div className="store-dashboard-body">{notice ? <Notice type="error">{notice.text}</Notice> : <Loading />}</div></section> : <Loading />;
  const storeName = profile.tienda_nombre || "Tienda asignada"; const expiring = documents.filter((d) => d.fecha_vencimiento && daysUntil(d.fecha_vencimiento) >= 0 && daysUntil(d.fecha_vencimiento) <= 30).sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)).slice(0, 3);
  const exportSummary = () => exportExcel(`resumen-${storeName}.xlsx`, [{ indicador: "Tienda", valor: storeName }, { indicador: "Personal activo", valor: people.filter((p) => p.estado === "activo").length }, { indicador: "Incidencias", valor: summary.incidencias }, { indicador: "Amonestaciones", valor: summary.amonestaciones }, { indicador: "Errores", valor: summary.errores }, { indicador: "Documentos por vencer", valor: summary.documentos_por_vencer }], "Resumen");
  const activePeople = people.filter((person) => person.estado === "activo");
  const employees = activePeople.filter((person) => ["trabajador", "vendedor", "asistente"].includes(person.rol));
  const securityPeople = activePeople.filter((person) => ["seguridad", "jefe_seguridad"].includes(person.rol));
  const securityIncidentTypes = new Set(["robo", "robo_frustrado", "cambio_precio"]);
  const securityIncidents = incidents.filter((incident) => securityIncidentTypes.has(incident.tipo)).length;
  const administrativeIncidents = incidents.filter((incident) => !securityIncidentTypes.has(incident.tipo)).length;
  const storeAttendance = zonalAlerts?.attendance?.tiendas?.find((store) => String(store.id) === String(storeId));
  return <section ref={dashboardRef} className={`store-dashboard-shell ${lightMode ? "is-light" : ""}`}>
    <div className="store-dashboard-topbar"><div><i /> <strong>{isZonal ? "SUPERVISIÓN ZONAL" : "ADMINISTRACIÓN DE TIENDA"}</strong><span>El filtro de período controla la asistencia, movimientos y errores del personal</span></div><div>{isZonal && <label className="store-dashboard-store-picker"><span>Tienda</span><select value={storeId} onChange={(event) => changeStore(event.target.value)} aria-label="Seleccionar tienda"><option value="all">Todas las tiendas</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.nombre}</option>)}</select></label>}<button onClick={refreshDashboard}><RefreshCw size={17} className={refreshing ? "is-spinning" : ""} />Actualizar datos</button><button onClick={() => setDashboardKey((value) => value + 1)}><RotateCcw size={17} />Limpiar filtros</button><button onClick={() => setLightMode((value) => !value)}><Sun size={17} />{lightMode ? "Modo claro" : "Modo oscuro"}</button><button onClick={toggleFullscreen}><Maximize2 size={17} />Pantalla completa</button></div></div>
    <header className="store-dashboard-hero"><div><span><Users size={38} /></span><div><h1>{isZonal ? "RESUMEN ZONAL" : "PANEL DE MI TIENDA"}</h1><p>Personal, asistencias, incidencias y capacitaciones de {storeName}</p></div></div><span className="store-dashboard-status"><i />Datos sincronizados · {new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</span></header>
    {notice && <Notice type={notice.type}>{notice.text}</Notice>}
    <div className="store-dashboard-body">
      <section className="store-dashboard-personnel-kpis"><DashboardPersonnelKpi label="Empleados, vendedores y asistentes" value={employees.length} detail="Personal activo de atención y operación" /><DashboardPersonnelKpi label="Seguridad" value={securityPeople.length} detail="Seguridad y jefe de seguridad" /><DashboardPersonnelKpi label="Administración de tienda" value={summary.administracion_tienda ?? 0} detail="Administrador y asistente de tienda" /></section>
      <section className="store-dashboard-paired-kpis"><DashboardPairedKpi label="Incidencias administrativas y medidas" first={{ value: administrativeIncidents, label: "Incidencias administrativas" }} second={{ value: summary.amonestaciones, label: "Amonestaciones" }} /><DashboardPairedKpi label="Errores y documentos" first={{ value: summary.errores, label: "Errores del personal" }} second={{ value: summary.documentos_por_vencer, label: "Documentos por vencer" }} /><DashboardPairedKpi label="Estado de la dotación" first={{ value: activePeople.length, label: "Personas activas" }} second={{ value: expiring.length, label: "Alertas documentales" }} /></section>
      {isZonal && <section className="store-dashboard-paired-kpis"><DashboardPairedKpi label="Asistencia del día" first={{ value: storeAttendance?.pendientes ?? 0, label: "Marcas pendientes" }} second={{ value: (storeAttendance?.faltas || 0) + (storeAttendance?.tardanzas || 0), label: "Faltas y tardanzas" }} /><DashboardSingleKpi label="Incidencias de seguridad" value={securityIncidents} detail="Incidencias de seguridad registradas" /><DashboardUpcomingDocumentsKpi documents={expiring} /></section>}
      <div className="store-dashboard-actions"><button onClick={() => onNavigate(isZonal ? "zonal-personal" : "usuarios")}><Users size={16} />{isZonal ? "Personal zonal" : "Gestionar personal"}</button>{!isZonal && <button onClick={() => onNavigate("asistencias")}><CalendarCheck2 size={16} />Registrar asistencia</button>}<button onClick={() => onNavigate("capacitaciones")}><GraduationCap size={16} />Capacitaciones</button><button onClick={() => onNavigate(isZonal ? "zonal-incidencias" : "incidencias-tienda")}><AlertTriangle size={16} />Incidencias</button><button onClick={exportSummary}><FileClock size={16} />Exportar resumen</button></div>
      <DashboardSection kicker="Afluencia de clientes" title="Tráfico de la tienda por hora" text="Identifica horas punta y ajusta la cobertura del equipo según la demanda real." />
      <TrafficHourMatrix user={user} tiendaId={isZonal ? storeId : ""} scopeName={storeName} period={matrixPeriod} />
      <DashboardSection kicker="Personal de tienda" title="Asistencia y movimientos del personal" text="Consulta asistencias, ingresos, salidas y permanencia de tu equipo." />
      {["jefe_tienda", "jefe_zonal"].includes(user.rol) && <AttendanceMatrix key={`${dashboardKey}-${storeId}`} people={people} errors={errors} onNavigate={onNavigate} tiendaId={isZonal ? storeId : null} readOnly={isZonal} period={matrixPeriod} onPeriodChange={setMatrixPeriod} />}
      <TrainingDevelopmentHome />
    </div>
  </section>;
}

function DashboardPersonnelKpi({ label, value, detail }) { return <article className="store-dashboard-personnel-kpi"><div><strong>{label}</strong><small>{detail}</small></div><b>{value}</b></article>; }
function DashboardPairedKpi({ label, first, second }) { return <article className="store-dashboard-paired-kpi"><h3>{label}</h3><div><span><strong>{first.value}</strong><small>{first.label}</small></span><span><strong>{second.value}</strong><small>{second.label}</small></span></div></article>; }
function DashboardSingleKpi({ label, value, detail }) { return <article className="store-dashboard-paired-kpi store-dashboard-single-kpi"><h3>{label}</h3><div><span><strong>{value}</strong><small>{detail}</small></span></div></article>; }
function DashboardUpcomingDocumentsKpi({ documents }) { return <article className="store-dashboard-paired-kpi store-dashboard-documents-kpi"><h3>Documentos próximos a vencer</h3><section className="store-dashboard-document-list">{documents.length ? documents.map((document) => <div key={document.id}><strong>{document.nombre || document.tipo_documento || "Documento"}</strong><small>Vence {formatDate(document.fecha_vencimiento)}</small></div>) : <small>No hay documentos por vencer</small>}</section></article>; }
function DashboardSection({ kicker, title, text }) { return <header className="store-dashboard-section"><div><span>{kicker}</span><h2>{title}</h2></div><p>{text}</p></header>; }

function ZonalStoreComparison({ user, refreshKey, onSelectStore }) {
  const [period, setPeriod] = useState(() => { const now = todayISO(); return { year: now.slice(0, 4), monthNumber: now.slice(5, 7), week: "", day: now.slice(8, 10) }; });
  const [comparison, setComparison] = useState(null);
  const [appliedPeriod, setAppliedPeriod] = useState(period);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const now = todayISO();
  const { year, monthNumber, week, day } = period;
  const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const lastDay = year === now.slice(0, 4) && monthNumber === now.slice(5, 7) ? Number(now.slice(8, 10)) : new Date(Number(year), Number(monthNumber), 0).getDate();
  const selectedDays = Array.from({ length: lastDay }, (_, index) => index + 1).filter((value) => (!week || Math.ceil(value / 7) === Number(week)) && (!day || value === Number(day)));
  const desde = `${year}-${monthNumber}-${String(selectedDays[0]).padStart(2, "0")}`;
  const hasta = `${year}-${monthNumber}-${String(selectedDays.at(-1)).padStart(2, "0")}`;
  const requestedLabel = desde === hasta ? formatDate(desde) : `${formatDate(desde)} al ${formatDate(hasta)}`;
  const displayedFrom = comparison?.desde || comparison?.fecha;
  const displayedTo = comparison?.hasta || comparison?.fecha;
  const displayedLabel = displayedFrom === displayedTo ? formatDate(displayedFrom) : `${formatDate(displayedFrom)} al ${formatDate(displayedTo)}`;
  const periodLabel = comparison ? displayedLabel : requestedLabel;
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    api(`/zonal/comparativa?fecha=${hasta}&desde=${desde}&hasta=${hasta}`).then((result) => { if (active) { setComparison(result); setAppliedPeriod(period); } }).catch((failure) => { if (active) setError(failure.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [desde, hasta, period, refreshKey]);
  const rows = comparison?.tiendas || [];
  const totals = rows.reduce((sum, row) => ({
    personal: sum.personal + row.personal, presentes: sum.presentes + row.presentes,
    tardanzas: sum.tardanzas + row.tardanzas, faltas: sum.faltas + row.faltas,
    pendientes: sum.pendientes + row.pendientes, visitas: sum.visitas + row.visitas,
    incidencias: sum.incidencias + row.incidencias_seguridad + row.incidencias_administrativas,
    documentos: sum.documentos + row.documentos_por_vencer,
  }), { personal: 0, presentes: 0, tardanzas: 0, faltas: 0, pendientes: 0, visitas: 0, incidencias: 0, documentos: 0 });
  const chartHeight = Math.max(290, rows.length * 38 + 45);
  return <div className="store-dashboard-body zonal-comparison">
    <header className="store-dashboard-section"><div><span>Vista general · {periodLabel}</span><h2>Comparación entre tiendas</h2></div><p>Asistencia, tráfico, incidencias y errores del período seleccionado. Documentos por vencer en 30 días desde el fin del período.</p></header>
    <button type="button" className={`attendance-filter-fab ${filtersOpen ? "open" : ""}`} onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen} aria-label="Filtros de período"><Filter size={16} /><span>Periodo</span></button>
    {filtersOpen && <aside className="attendance-filter-popover" aria-label="Filtros de todas las tiendas">
      <div className="attendance-filter-popover__head"><div><span className="eyebrow">Periodo global</span><h3>Filtros de gráficas</h3></div><button type="button" className="icon-button" onClick={() => setFiltersOpen(false)} aria-label="Cerrar filtros"><X size={16} /></button></div>
      <label className="field"><span>Año</span><select value={year} onChange={(event) => setPeriod({ year: event.target.value, monthNumber: event.target.value === now.slice(0, 4) && Number(monthNumber) > Number(now.slice(5, 7)) ? now.slice(5, 7) : monthNumber, week: "", day: "" })}>{Array.from({ length: 6 }, (_, index) => String(Number(now.slice(0, 4)) - index)).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="field"><span>Mes</span><select value={monthNumber} onChange={(event) => setPeriod({ year, monthNumber: event.target.value, week: "", day: "" })}>{monthNames.slice(0, year === now.slice(0, 4) ? Number(now.slice(5, 7)) : 12).map((name, index) => <option key={name} value={String(index + 1).padStart(2, "0")}>{name}</option>)}</select></label>
      <label className="field"><span>Semana</span><select value={week} onChange={(event) => setPeriod({ year, monthNumber, week: event.target.value, day: "" })}><option value="">Todas las semanas</option>{Array.from({ length: Math.ceil(lastDay / 7) }, (_, index) => <option key={index + 1} value={index + 1}>Semana {index + 1} ({index * 7 + 1}–{Math.min((index + 1) * 7, lastDay)})</option>)}</select></label>
      <label className="field"><span>Día</span><select value={day} onChange={(event) => setPeriod({ year, monthNumber, week: "", day: event.target.value })}><option value="">Todos los días</option>{Array.from({ length: lastDay }, (_, index) => <option key={index + 1} value={String(index + 1).padStart(2, "0")}>{index + 1}</option>)}</select></label>
      <div className="attendance-filter-summary">{requestedLabel}</div>
      <button type="button" className="button button--ghost button--small" onClick={() => setPeriod({ year: now.slice(0, 4), monthNumber: now.slice(5, 7), week: "", day: "" })}><RotateCcw size={14} />Restablecer</button>
    </aside>}
    {loading && <div className="zonal-comparison-sync" role="status">Actualizando datos para {requestedLabel}…</div>}{error && <Notice type="error">{error}</Notice>}
    {comparison && <>
    <section className="zonal-comparison-summary" aria-label="Resumen de la zona">
      <article><small>Tiendas asignadas</small><strong>{rows.length}</strong></article>
      <article><small>Personal activo</small><strong>{totals.personal}</strong></article>
      <article><small>Presentes y tardanzas · período</small><strong>{totals.presentes + totals.tardanzas}</strong></article>
      <article><small>Visitas · período</small><strong>{totals.visitas.toLocaleString("es-PE")}</strong></article>
      <article><small>Incidencias · período</small><strong>{totals.incidencias}</strong></article>
      <article><small>Documentos por vencer</small><strong>{totals.documentos}</strong></article>
    </section>
    {rows.length ? <>
      <div className="zonal-comparison-charts">
        <article><header><h3>Asistencia por tienda</h3><p>Estados y marcas pendientes · {periodLabel}</p></header><div className="zonal-comparison-chart-scroll"><div className="zonal-comparison-chart" style={{ height: chartHeight }}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={rows} margin={{ top: 12, right: 16, left: 4, bottom: 10 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e0e8f0" /><XAxis type="number" allowDecimals={false} tick={{ fill: "#52667c", fontSize: 11 }} /><YAxis type="category" dataKey="nombre" width={132} tick={{ fill: "#173b60", fontSize: 11, fontWeight: 700 }} /><Tooltip /><Legend /><Bar dataKey="presentes" name="Presentes" stackId="asistencia" fill="#16a66a" /><Bar dataKey="tardanzas" name="Tardanzas" stackId="asistencia" fill="#f0ad32" /><Bar dataKey="faltas" name="Faltas" stackId="asistencia" fill="#e36a70" /><Bar dataKey="pendientes" name="Pendientes" stackId="asistencia" fill="#a7b6c6" /><Bar dataKey="otros" name="Otros" stackId="asistencia" fill="#8f7ac8" /></BarChart></ResponsiveContainer></div></div></article>
        <article><header><h3>Visitas por tienda</h3><p>Clientes registrados · {periodLabel}</p></header><div className="zonal-comparison-chart-scroll"><div className="zonal-comparison-chart" style={{ height: chartHeight }}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={rows} margin={{ top: 12, right: 16, left: 4, bottom: 10 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e0e8f0" /><XAxis type="number" allowDecimals={false} tick={{ fill: "#52667c", fontSize: 11 }} /><YAxis type="category" dataKey="nombre" width={132} tick={{ fill: "#173b60", fontSize: 11, fontWeight: 700 }} /><Tooltip formatter={(value) => Number(value).toLocaleString("es-PE")} /><Bar dataKey="visitas" name="Visitas" fill="#0d6fa1" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></div></div></article>
        <article className="zonal-comparison-charts-wide"><header><h3>Incidencias y errores por tienda</h3><p>Registros · {periodLabel}</p></header><div className="zonal-comparison-chart-scroll"><div className="zonal-comparison-chart" style={{ height: chartHeight }}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={rows} margin={{ top: 12, right: 16, left: 4, bottom: 10 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e0e8f0" /><XAxis type="number" allowDecimals={false} tick={{ fill: "#52667c", fontSize: 11 }} /><YAxis type="category" dataKey="nombre" width={132} tick={{ fill: "#173b60", fontSize: 11, fontWeight: 700 }} /><Tooltip /><Legend /><Bar dataKey="incidencias_administrativas" name="Incidencias administrativas" stackId="incidencias" fill="#e6a23c" /><Bar dataKey="incidencias_seguridad" name="Incidencias de seguridad" stackId="incidencias" fill="#d75b66" /><Bar dataKey="errores" name="Errores del personal" fill="#4b86bb" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></div></div></article>
      </div>
      <section className="zonal-comparison-traffic"><header><div><span>Tráfico consolidado</span><h2>Movimiento por hora · todas las tiendas</h2></div><p>Suma de visitas de la zona · {periodLabel}.</p></header><TrafficHourMatrix user={user} scopeName="todas las tiendas" period={appliedPeriod} refreshKey={refreshKey} /></section>
      <section className="zonal-comparison-table-card"><header><h3>Detalle por tienda</h3><p>Selecciona una tienda para abrir su panel completo.</p></header><div className="zonal-comparison-table-scroll"><table><thead><tr><th>Tienda</th><th>Personal</th><th>Presentes</th><th>Tardanzas</th><th>Faltas</th><th>Pendientes</th><th>Visitas</th><th>Inc. admin.</th><th>Inc. seguridad</th><th>Errores</th><th>Documentos por vencer</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><th><button type="button" onClick={() => onSelectStore(String(row.id))}>{row.nombre}</button></th><td>{row.personal}</td><td>{row.presentes}</td><td>{row.tardanzas}</td><td>{row.faltas}</td><td>{row.pendientes}</td><td>{row.visitas.toLocaleString("es-PE")}</td><td>{row.incidencias_administrativas}</td><td>{row.incidencias_seguridad}</td><td>{row.errores}</td><td>{row.documentos_por_vencer}</td></tr>)}</tbody></table></div></section>
    </> : <p className="zonal-comparison-empty">No hay tiendas asignadas a tu zona.</p>}
    </>}
  </div>;
}

function TrainingDevelopmentHome() {
  const [courses, setCourses] = useState([]); const [courseId, setCourseId] = useState(""); const [people, setPeople] = useState([]); const [status, setStatus] = useState("todos");
  useEffect(() => { api("/cursos").then((rows) => { const active = rows.filter((row) => row.activo); setCourses(active); setCourseId((current) => current || String(active[0]?.id || "")); }).catch(() => setCourses([])); }, []);
  useEffect(() => { if (!courseId) return; api(`/capacitaciones/trabajadores?curso_id=${courseId}&estado=activo`).then(setPeople).catch(() => setPeople([])); }, [courseId]);
  const visible = people.filter((person) => status === "todos" || person.progreso_estado === status); const completed = visible.filter((person) => person.progreso_estado === "completado").length;
  return <section className="training-development"><header><div><span>Desarrollo</span><h2>Capacitación y desarrollo</h2></div><p>Avance y estado de cursos asignados al personal.</p></header><div className="training-development-filters"><label>Curso<select value={courseId} onChange={(event) => setCourseId(event.target.value)}><option value="">Todos</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.nombre}</option>)}</select></label><label>Estado<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="todos">Todos</option><option value="completado">Completado</option><option value="en_curso">En curso</option><option value="pendiente">Pendiente</option></select></label></div><div className="training-development-grid"><article><header><h3>Avance de capacitaciones</h3><strong>{visible.length ? Math.round(completed * 100 / visible.length) : 0}% completado</strong></header><div className="training-development-bars">{visible.map((person) => <div key={person.id}><strong>{person.nombres} {person.apellidos}</strong><span><i style={{ width: person.progreso_estado === "completado" ? "100%" : person.progreso_estado === "en_curso" ? "55%" : "0%" }} /><b>{person.progreso_estado === "completado" ? "1/1" : "0/1"}</b></span></div>)}</div></article><article><header><h3>Historial de capacitaciones</h3><strong>{visible.length} asignaciones</strong></header><div className="training-history"><div className="training-history-head"><span>Trabajador</span><span>Curso</span><span>Estado</span></div>{visible.map((person) => <div key={person.id}><strong>{person.nombres} {person.apellidos}</strong><span>{courses.find((course) => String(course.id) === String(courseId))?.nombre || "Cursos"}</span><span>{person.progreso_estado?.replace("_", " ") || "pendiente"}</span></div>)}</div></article></div></section>;
}

const attendanceCodes = {
  presente: { code: "A", label: "Asistencia" },
  tardanza: { code: "T", label: "Tardanza" },
  medio_turno: { code: "M", label: "Medio turno" },
  apoyo: { code: "AP", label: "Apoyo" },
  falta: { code: "F", label: "Falta" },
  permiso: { code: "P", label: "Permiso" },
  descanso_medico: { code: "DM", label: "Descanso médico" },
  suspension: { code: "S", label: "Suspensión" },
};

function AttendanceMatrix({ people, errors, onNavigate, tiendaId, readOnly = false, period, onPeriodChange }) {
  const currentDate = todayISO();
  const { year, monthNumber, week, day } = period;
  const setYear = (value) => onPeriodChange((current) => ({ ...current, year: value }));
  const setMonthNumber = (value) => onPeriodChange((current) => ({ ...current, monthNumber: value }));
  const [workerId, setWorkerId] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const setWeek = (value) => onPeriodChange((current) => ({ ...current, week: value }));
  const setDay = (value) => onPeriodChange((current) => ({ ...current, day: value }));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [records, setRecords] = useState(null);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [error, setError] = useState("");
  const recordsCache = useRef(new Map());
  const month = `${year}-${monthNumber}`;
  const dayCount = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const currentYear = currentDate.slice(0, 4);
  const currentMonthNumber = Number(currentDate.slice(5, 7));
  const maxVisibleDay = year === currentYear && Number(monthNumber) === currentMonthNumber ? Number(currentDate.slice(8, 10)) : dayCount;
  const allDays = Array.from({ length: maxVisibleDay }, (_, index) => index + 1);
  const days = allDays.filter((value) => (!day || value === Number(day)) && (!week || Math.ceil(value / 7) === Number(week)));
  const yearOptions = Array.from({ length: 6 }, (_, index) => String(Number(currentDate.slice(0, 4)) - index));
  const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const availableMonths = year === currentYear ? monthNames.slice(0, currentMonthNumber) : monthNames;

  useEffect(() => {
    const cached = recordsCache.current.get(year);
    if (cached) { setRecords(cached); setError(""); return; }
    let active = true;
    setLoadingRecords(true); setError("");
    api(`/asistencias/historial?desde=${year}-01-01&hasta=${year}-12-31&estado_usuario=todos&orden=asc${tiendaId ? `&tienda_id=${tiendaId}` : ""}`)
      .then((rows) => { if (!active) return; recordsCache.current.set(year, rows); setRecords(rows); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoadingRecords(false); });
    return () => { active = false; };
  }, [year, tiendaId]);

  useEffect(() => {
    if (!expanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => { if (event.key === "Escape") setExpanded(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [expanded]);

  const visiblePeople = people.filter((person) => (includeInactive || person.estado === "activo") && (!workerId || String(person.id) === workerId));
  const monthRecords = (records || []).filter((record) => record.fecha.startsWith(month));
  const byPersonAndDay = new Map(monthRecords.map((record) => [`${record.usuario_id}-${Number(record.fecha.slice(8, 10))}`, record]));
  const resetFilters = () => {
    setYear(currentDate.slice(0, 4)); setMonthNumber(currentDate.slice(5, 7));
    setWorkerId(""); setIncludeInactive(false); onPeriodChange({ year: currentDate.slice(0, 4), monthNumber: currentDate.slice(5, 7), week: "", day: "" });
  };

  return <><section className={`panel attendance-matrix-panel ${expanded ? "attendance-matrix-panel--expanded" : ""}`}>
    <header className="panel__header attendance-matrix-header">
      <div><span className="eyebrow">Control mensual</span><h2>Matriz de asistencia · {monthNames[Number(monthNumber) - 1]} {year}</h2><p>Resumen diario del personal de la tienda.</p></div>
      <div className="attendance-matrix-actions">
        {!readOnly && <button className="button button--ghost button--small" onClick={() => onNavigate("asistencias")}>Gestionar asistencia</button>}
        <button className="icon-button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Cerrar vista ampliada" : "Ampliar matriz"}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
      </div>
    </header>
    <div className="attendance-matrix-legend">
      {Object.entries(attendanceCodes).map(([state, item]) => <span key={state}><i className={`attendance-matrix-dot attendance-matrix-dot--${state}`}>{item.code}</i>{item.label}</span>)}
    </div>
    {loadingRecords && <div className="attendance-matrix-sync"><span />Actualizando datos de {year}…</div>}
    <button className={`attendance-filter-fab ${filtersOpen ? "open" : ""}`} onClick={() => setFiltersOpen((value) => !value)}><Filter size={16} /><span>Periodo</span></button>
    {filtersOpen && <aside className="attendance-filter-popover">
      <div className="attendance-filter-popover__head"><div><span className="eyebrow">Periodo global</span><h3>Filtros de matriz</h3></div><button className="icon-button" onClick={() => setFiltersOpen(false)} aria-label="Cerrar filtros"><X size={16} /></button></div>
      <label className="field"><span>Trabajador</span><select value={workerId} onChange={(event) => setWorkerId(event.target.value)}><option value="">Todos los trabajadores</option>{people.filter((person) => includeInactive || person.estado === "activo").map((person) => <option key={person.id} value={person.id}>{person.nombres} {person.apellidos}</option>)}</select></label>
      <label className="attendance-filter-check"><input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} /><span>Incluir trabajadores inactivos</span></label>
      <label className="field"><span>Año</span><select value={year} onChange={(event) => { const nextYear = event.target.value; setYear(nextYear); if (nextYear === currentYear && Number(monthNumber) > currentMonthNumber) setMonthNumber(String(currentMonthNumber).padStart(2, "0")); setDay(""); }}><option value={year}>{year}</option>{yearOptions.filter((item) => item !== year).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="field"><span>Mes</span><select value={monthNumber} onChange={(event) => { setMonthNumber(event.target.value); setDay(""); }}>{availableMonths.map((name, index) => <option key={name} value={String(index + 1).padStart(2, "0")}>{name}</option>)}</select></label>
      <label className="field"><span>Semana</span><select value={week} onChange={(event) => { setWeek(event.target.value); setDay(""); }}><option value="">Todas las semanas</option>{Array.from({ length: Math.ceil(dayCount / 7) }, (_, index) => <option key={index + 1} value={index + 1}>Semana {index + 1} ({index * 7 + 1}-{Math.min((index + 1) * 7, dayCount)})</option>)}</select></label>
      <label className="field"><span>Día</span><select value={day} onChange={(event) => { setDay(event.target.value); setWeek(""); }}><option value="">Todos los días</option>{allDays.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <div className="attendance-filter-summary">{year} · {monthNames[Number(monthNumber) - 1]}{week ? ` · semana ${week}` : ""}{day ? ` · día ${day}` : ""}</div>
      <button className="button button--ghost button--small" onClick={resetFilters}><RotateCcw size={14} />Restablecer</button>
    </aside>}
    {error ? <Notice type="error">{error}</Notice> : records === null ? <Loading /> : visiblePeople.length ? (
      <div className="attendance-matrix-scroll">
        <div className="attendance-matrix" style={{ "--attendance-days": days.length }}>
          <div className="attendance-matrix-row attendance-matrix-row--totals">
            <strong className="attendance-matrix-person">Total asistencia</strong>
            {days.map((value) => <strong key={value}>{visiblePeople.filter((person) => byPersonAndDay.get(`${person.id}-${value}`)?.estado === "presente").length}</strong>)}
            <strong className="attendance-matrix-total" /><strong className="attendance-matrix-total" /><strong className="attendance-matrix-total" />
          </div>
          <div className="attendance-matrix-row attendance-matrix-row--head">
            <span className="attendance-matrix-person">Trabajador</span>
            {days.map((value) => <span key={value} className={currentDate === `${month}-${String(value).padStart(2, "0")}` ? "is-today" : ""}><small>{new Intl.DateTimeFormat("es-PE", { weekday: "narrow", timeZone: "UTC" }).format(new Date(`${month}-${String(value).padStart(2, "0")}T12:00:00Z`))}</small>{value}</span>)}
            <span className="attendance-matrix-total">A</span><span className="attendance-matrix-total">F</span><span className="attendance-matrix-total">T</span>
          </div>
          {visiblePeople.map((person) => {
            const personRecords = days.map((day) => byPersonAndDay.get(`${person.id}-${day}`));
            return <div className="attendance-matrix-row" key={person.id}>
              <div className="attendance-matrix-person"><span className="avatar">{person.nombres?.charAt(0).toUpperCase()}</span><div><strong>{person.nombres} {person.apellidos}</strong><small>{person.rol === "jefe_tienda" ? "Jefe de tienda" : person.rol?.replaceAll("_", " ")}</small></div></div>
              {personRecords.map((record, index) => {
                const state = record?.estado;
                const item = attendanceCodes[state];
                return <span key={days[index]} className={`attendance-matrix-cell ${state ? `attendance-matrix-cell--${state}` : ""}`} title={item ? `${item.label}${record.observaciones ? `: ${record.observaciones}` : ""}` : "Sin registro"}>{item?.code || "·"}</span>;
              })}
              <strong className="attendance-matrix-total">{personRecords.filter((record) => record?.estado === "presente").length}</strong>
              <strong className="attendance-matrix-total">{personRecords.filter((record) => record?.estado === "falta").length}</strong>
              <strong className="attendance-matrix-total">{personRecords.filter((record) => record?.estado === "tardanza").length}</strong>
            </div>;
          })}
        </div>
      </div>
    ) : <p className="store-empty-copy">No hay trabajadores para mostrar con estos filtros.</p>}
  </section>
  <PersonnelCharts people={people} errors={errors} year={year} monthNumber={monthNumber} week={week} day={day} />
  </>;
}

const chartTooltipStyle = { color: "#f3eee5", background: "#171719", border: "1px solid rgba(206,169,92,.3)", borderRadius: 12, fontSize: 11 };
const exitReasonColors = ["#d9635f", "#c9932f", "#7668ba", "#4f8dc9", "#8d96a3", "#2f9e78"];

function PersonnelCharts({ people, errors, year, monthNumber, week, day }) {
  const [expandedChart, setExpandedChart] = useState("");
  const [visibleRotationSeries, setVisibleRotationSeries] = useState({ ingresos: true, salidas: true });
  const [movementDetail, setMovementDetail] = useState(null);
  const [errorDetail, setErrorDetail] = useState(null);
  const now = todayISO();
  const allMonthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const monthNames = year === now.slice(0, 4) ? allMonthNames.slice(0, Number(now.slice(5, 7))) : allMonthNames;
  const rotation = monthNames.map((monthName, monthIndex) => {
    const start = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
    const end = new Date(Number(year), monthIndex + 1, 0).toISOString().slice(0, 10);
    return {
      mes: monthName,
      ingresos: people.filter((person) => person.fecha_ingreso >= start && person.fecha_ingreso <= end),
      salidas: people.filter((person) => person.fecha_salida >= start && person.fecha_salida <= end),
      personalInicio: people.filter((person) => person.fecha_ingreso <= start && (!person.fecha_salida || person.fecha_salida >= start)).length,
      personalFin: people.filter((person) => person.fecha_ingreso <= end && (!person.fecha_salida || person.fecha_salida >= end)).length,
    };
  });
  const selectedMonthName = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][Number(monthNumber) - 1];
  const departed = people.filter((person) => person.fecha_salida?.startsWith(`${year}-${monthNumber}`));
  const reasonsMap = new Map();
  for (const person of departed) {
    const reason = person.motivo_salida?.trim() || "Sin motivo registrado";
    reasonsMap.set(reason, (reasonsMap.get(reason) || 0) + 1);
  }
  const exitReasons = [...reasonsMap.entries()].map(([motivo, cantidad]) => ({ motivo, cantidad }));
  const totalEntries = rotation.reduce((sum, item) => sum + item.ingresos.length, 0);
  const totalExits = rotation.reduce((sum, item) => sum + item.salidas.length, 0);
  const rotationMaximum = Math.max(...rotation.flatMap((item) => [item.ingresos.length, item.salidas.length]), 1);
  const periodErrors = (errors || []).filter((item) => {
    if (!item.fecha?.startsWith(`${year}-${monthNumber}`)) return false;
    const errorDay = Number(item.fecha.slice(8, 10));
    if (day && errorDay !== Number(day)) return false;
    if (week && Math.ceil(errorDay / 7) !== Number(week)) return false;
    return true;
  });
  const errorsByResponsible = [...periodErrors.reduce((groups, item) => {
    const name = `${item.usuarios?.nombres || ""} ${item.usuarios?.apellidos || ""}`.trim() || "Sin identificar";
    const group = groups.get(name) || { name, value: 0, areas: new Set(), rows: [] };
    group.value += 1; group.rows.push(item); group.areas.add(item.categoria || "Sin categoría"); groups.set(name, group);
    return groups;
  }, new Map()).values()].map((item) => ({ ...item, area: [...item.areas].join(", ") })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const errorMaximum = Math.max(...errorsByResponsible.map((item) => item.value), 1);

  useEffect(() => {
    if (!expandedChart) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => { if (event.key === "Escape") setExpandedChart(""); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [expandedChart]);

  return <section className="personnel-charts-grid">
    <article className={`panel personnel-chart-panel ${expandedChart === "rotation" ? "personnel-chart-panel--expanded" : ""}`}>
      <header className="panel__header rotation-comparison-header"><div><h2>Rotación de Personal por Mes · {year}</h2></div><div className="personnel-chart-actions"><span className="panel-tag">{totalEntries} ingresos · {totalExits} salidas</span><button className="icon-button" onClick={() => setExpandedChart(expandedChart === "rotation" ? "" : "rotation")} aria-label={expandedChart === "rotation" ? "Cerrar vista ampliada" : "Ampliar rotación"}>{expandedChart === "rotation" ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div></header>
      <div className="rotation-comparison">
        <div className="rotation-comparison-legend"><button className={visibleRotationSeries.ingresos ? "" : "is-muted"} onClick={() => setVisibleRotationSeries((current) => ({ ...current, ingresos: !current.ingresos }))}><i style={{ background: "#05b13e" }} />Ingreso</button><button className={visibleRotationSeries.salidas ? "" : "is-muted"} onClick={() => setVisibleRotationSeries((current) => ({ ...current, salidas: !current.salidas }))}><i style={{ background: "#f4303f" }} />Salida</button></div>
        <div className="rotation-headcount-legend"><span>Personal al inicio del mes</span><span>Personal al fin del mes</span></div>
        <div className="rotation-comparison-list">
          {rotation.map((item, index) => <div className="rotation-comparison-row" key={item.mes}>
            <strong>{item.mes}</strong><span className="rotation-headcount">{item.personalInicio}</span>
            <button className="rotation-track-button" disabled={!item.ingresos.length} title={item.ingresos.length ? "Haz clic para ver trabajadores" : "Sin ingresos registrados"} onClick={() => setMovementDetail({ month: item.mes, label: "Ingresos", rows: item.ingresos })}><i style={{ width: visibleRotationSeries.ingresos ? `${(item.ingresos.length / rotationMaximum) * 100}%` : "0%", background: "#05b13e", "--rotation-index": index }} /><span>{visibleRotationSeries.ingresos ? item.ingresos.length : "—"}</span></button>
            <button className="rotation-track-button" disabled={!item.salidas.length} title={item.salidas.length ? "Haz clic para ver trabajadores" : "Sin salidas registradas"} onClick={() => setMovementDetail({ month: item.mes, label: "Salidas", rows: item.salidas })}><i style={{ width: visibleRotationSeries.salidas ? `${(item.salidas.length / rotationMaximum) * 100}%` : "0%", background: "#f4303f", "--rotation-index": index }} /><span>{visibleRotationSeries.salidas ? item.salidas.length : "—"}</span></button>
            <span className="rotation-headcount">{item.personalFin}</span>
          </div>)}
        </div>
      </div>
    </article>
    <article className={`panel personnel-chart-panel ${expandedChart === "reasons" ? "personnel-chart-panel--expanded" : ""}`}>
      <header className="panel__header"><div><span className="eyebrow">Desvinculaciones</span><h2>Motivos de Salida del Personal · {selectedMonthName} {year}</h2><p>Distribución de los motivos registrados en las salidas.</p></div><div className="personnel-chart-actions"><span className="panel-tag">{departed.length} salidas</span><button className="icon-button" onClick={() => setExpandedChart(expandedChart === "reasons" ? "" : "reasons")} aria-label={expandedChart === "reasons" ? "Cerrar vista ampliada" : "Ampliar motivos de salida"}>{expandedChart === "reasons" ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div></header>
      {exitReasons.length ? <><div className="personnel-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={exitReasons} dataKey="cantidad" nameKey="motivo" innerRadius={57} outerRadius={84} paddingAngle={3}>{exitReasons.map((item, index) => <Cell key={item.motivo} fill={exitReasonColors[index % exitReasonColors.length]} />)}</Pie><Tooltip contentStyle={chartTooltipStyle} /></PieChart></ResponsiveContainer><div><strong>{departed.length}</strong><small>Total</small></div></div><div className="personnel-reasons">{exitReasons.map((item, index) => <span key={item.motivo}><i style={{ background: exitReasonColors[index % exitReasonColors.length] }} />{item.motivo}<strong>{item.cantidad}</strong></span>)}</div></> : <div className="personnel-chart-empty"><strong>0</strong><span>No hay salidas registradas en {selectedMonthName} de {year}.</span></div>}
    </article>
    <DashboardSection kicker="Seguimiento del personal" title="Errores registrados" text="Responsables, categorías y acciones correctivas aplicadas en la tienda." />
    <article className={`panel personnel-chart-panel personnel-chart-panel--errors ${expandedChart === "errors" ? "personnel-chart-panel--expanded" : ""}`}>
      <header className="panel__header"><div><span className="eyebrow">Calidad operativa</span><h2>Errores por Usuario o Área · {selectedMonthName} {year}</h2><p>Errores agrupados por la persona responsable y su categoría.</p></div><div className="personnel-chart-actions"><span className="panel-tag">{periodErrors.length} errores</span><button className="icon-button" onClick={() => setExpandedChart(expandedChart === "errors" ? "" : "errors")} aria-label={expandedChart === "errors" ? "Cerrar vista ampliada" : "Ampliar errores"}>{expandedChart === "errors" ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div></header>
      {errorsByResponsible.length ? <div className="dashboard-horizontal-bars">{errorsByResponsible.map((item, index) => <button key={item.name} className="dashboard-horizontal-bar" onClick={() => setErrorDetail(item)} title="Haz clic para ver el detalle"><span className="dashboard-horizontal-rank">{String(index + 1).padStart(2, "0")}</span><span className="dashboard-horizontal-label"><strong>{item.name}</strong><small>{item.area}</small></span><span className="dashboard-horizontal-track"><i style={{ width: `${(item.value / errorMaximum) * 100}%`, "--bar-index": index }} /></span><strong className="dashboard-horizontal-value">{item.value}</strong></button>)}</div> : <div className="personnel-chart-empty"><strong>0</strong><span>No hay errores registrados en {selectedMonthName} de {year}.</span></div>}
    </article>
    {movementDetail && <div className="movement-modal" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setMovementDetail(null); }}><section><header><div><span className="eyebrow">{movementDetail.month} {year}</span><h2>{movementDetail.label} de personal</h2></div><button className="icon-button" onClick={() => setMovementDetail(null)} aria-label="Cerrar"><X size={17} /></button></header><div className="movement-modal-list">{movementDetail.rows.map((person) => <div key={person.id}><span className="avatar">{person.nombres?.charAt(0)}</span><div><strong>{person.nombres} {person.apellidos}</strong><small>{movementDetail.label === "Ingresos" ? formatDate(person.fecha_ingreso) : formatDate(person.fecha_salida)}</small></div></div>)}</div></section></div>}
    {errorDetail && <div className="dashboard-detail-modal" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setErrorDetail(null); }}><section><header><div><span className="eyebrow">{errorDetail.area}</span><h2>{errorDetail.name}</h2><p>{errorDetail.value} error(es) en {selectedMonthName} de {year}</p></div><button className="icon-button" onClick={() => setErrorDetail(null)} aria-label="Cerrar"><X size={17} /></button></header><div className="dashboard-error-detail-list">{errorDetail.rows.map((row) => <article key={row.id}><span><AlertTriangle size={15} /></span><div><strong>{row.categoria}</strong><p>{row.descripcion}</p><small>{formatDate(row.fecha)}{row.accion_correctiva ? ` · Acción: ${row.accion_correctiva}` : ""}</small></div></article>)}</div></section></div>}
  </section>;
}

function daysUntil(value) { return Math.ceil((new Date(`${value}T12:00:00`) - new Date()) / 86400000); }
