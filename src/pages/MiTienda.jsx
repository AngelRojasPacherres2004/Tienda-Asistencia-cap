import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarCheck2, FileClock, Filter, GraduationCap, Maximize2, Minimize2, RefreshCw, RotateCcw, Store, Sun, Users, X } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api, formatDate, todayISO } from "../lib/api";
import { Loading, Notice, StatusBadge } from "../components/UI";

export default function MiTienda({ user, onNavigate }) {
  const [profile, setProfile] = useState(null); const [summary, setSummary] = useState(null); const [people, setPeople] = useState([]); const [documents, setDocuments] = useState([]); const [errors, setErrors] = useState([]); const [notice, setNotice] = useState(null);
  const [refreshing, setRefreshing] = useState(false); const [lightMode, setLightMode] = useState(true); const [dashboardKey, setDashboardKey] = useState(0); const dashboardRef = useRef(null);
  const loadDashboard = () => { setRefreshing(true); return Promise.all([api("/perfil"), api("/operaciones/resumen"), api("/usuarios"), api("/documentos-tienda").catch(() => []), api("/errores-personal").catch(() => [])]).then(([p, s, team, docs, errorRows]) => { setProfile(p); setSummary(s); setPeople(team); setDocuments(docs); setErrors(errorRows); setNotice(null); }).catch((e) => setNotice({ type: "error", text: e.message })).finally(() => setRefreshing(false)); };
  useEffect(() => { loadDashboard(); }, []);
  if (!profile || !summary) return <Loading />;
  const storeName = profile.tienda_nombre || "Tienda asignada"; const expiring = documents.filter((d) => d.fecha_vencimiento && daysUntil(d.fecha_vencimiento) <= 30).slice(0, 4);
  const exportSummary = () => { const lines = ["Indicador,Valor", `Tienda,${storeName}`, `Personal activo,${people.filter((p) => p.estado === "activo").length}`, `Incidencias,${summary.incidencias}`, `Amonestaciones,${summary.amonestaciones}`, `Errores,${summary.errores}`, `Documentos por vencer,${summary.documentos_por_vencer}`]; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })); a.download = `resumen-${storeName}.csv`; a.click(); URL.revokeObjectURL(a.href); };
  const activePeople = people.filter((person) => person.estado === "activo");
  const employees = activePeople.filter((person) => ["trabajador", "vendedor", "asistente"].includes(person.rol));
  const securityPeople = activePeople.filter((person) => ["seguridad", "jefe_seguridad"].includes(person.rol));
  const administrativePeople = activePeople.filter((person) => ["jefe_tienda", "asistente_tienda"].includes(person.rol));
  const toggleFullscreen = async () => { if (document.fullscreenElement) await document.exitFullscreen(); else await dashboardRef.current?.requestFullscreen(); };
  return <section ref={dashboardRef} className={`store-dashboard-shell ${lightMode ? "is-light" : ""}`}>
    <div className="store-dashboard-topbar"><div><i /> <strong>ADMINISTRACIÓN DE TIENDA</strong><span>El filtro de período controla la asistencia, movimientos y errores del personal</span></div><div><button onClick={loadDashboard}><RefreshCw size={17} className={refreshing ? "is-spinning" : ""} />Actualizar datos</button><button onClick={() => setDashboardKey((value) => value + 1)}><RotateCcw size={17} />Limpiar filtros</button><button onClick={() => setLightMode((value) => !value)}><Sun size={17} />{lightMode ? "Modo claro" : "Modo oscuro"}</button><button onClick={toggleFullscreen}><Maximize2 size={17} />Pantalla completa</button></div></div>
    <header className="store-dashboard-hero"><div><span><Users size={38} /></span><div><h1>PANEL DE MI TIENDA</h1><p>Personal, asistencias, incidencias y capacitaciones de {storeName}</p></div></div><span className="store-dashboard-status"><i />Datos sincronizados · {new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</span></header>
    {notice && <Notice type={notice.type}>{notice.text}</Notice>}
    <div className="store-dashboard-body">
      <section className="store-dashboard-personnel-kpis"><DashboardPersonnelKpi label="Empleados, vendedores y asistentes" value={employees.length} detail="Personal activo de atención y operación" /><DashboardPersonnelKpi label="Seguridad" value={securityPeople.length} detail="Seguridad y jefe de seguridad" /><DashboardPersonnelKpi label="Administración de tienda" value={administrativePeople.length} detail="Administrador y asistente de tienda" /></section>
      <section className="store-dashboard-paired-kpis"><DashboardPairedKpi label="Incidencias y medidas" first={{ value: summary.incidencias, label: "Incidencias registradas" }} second={{ value: summary.amonestaciones, label: "Amonestaciones" }} /><DashboardPairedKpi label="Errores y documentos" first={{ value: summary.errores, label: "Errores del personal" }} second={{ value: summary.documentos_por_vencer, label: "Documentos por vencer" }} /><DashboardPairedKpi label="Estado de la dotación" first={{ value: activePeople.length, label: "Personas activas" }} second={{ value: expiring.length, label: "Alertas documentales" }} /></section>
      <div className="store-dashboard-actions"><button onClick={() => onNavigate("usuarios")}><Users size={16} />Gestionar personal</button><button onClick={() => onNavigate("asistencias")}><CalendarCheck2 size={16} />Registrar asistencia</button><button onClick={() => onNavigate("capacitaciones")}><GraduationCap size={16} />Capacitaciones</button><button onClick={() => onNavigate("incidencias-tienda")}><AlertTriangle size={16} />Incidencias</button><button onClick={exportSummary}><FileClock size={16} />Exportar resumen</button></div>
      <DashboardSection kicker="Personal de tienda" title="Asistencia y movimientos del personal" text="Consulta asistencias, ingresos, salidas y permanencia de tu equipo." />
      {user.rol === "jefe_tienda" && <AttendanceMatrix key={dashboardKey} people={people} errors={errors} onNavigate={onNavigate} />}
      <DashboardSection kicker="Información de la sede" title="Datos y accesos de la tienda" text="Información principal, documentos próximos a vencer y accesos rápidos." />
      <div className="store-overview-grid"><section className="panel store-main-data"><header className="panel__header"><div><h2>Datos principales</h2><p>Información operativa de la sede</p></div><Store size={22} /></header><dl><div><dt>Nombre</dt><dd>{storeName}</dd></div><div><dt>Estado operativo</dt><dd><StatusBadge value="activo" /></dd></div><div className="span-2"><dt>Dirección</dt><dd>{profile.tienda_direccion || "Sin dirección registrada"}</dd></div><div><dt>Administrador responsable</dt><dd>{user.rol === "jefe_tienda" ? `${user.nombres} ${user.apellidos}` : "Administrador de tienda asignado"}</dd></div><div><dt>Personal activo</dt><dd>{activePeople.length}</dd></div></dl></section><div className="store-side-stack"><section className="panel"><header className="panel__header"><h2>Estado documental</h2></header>{user.rol === "jefe_tienda" ? expiring.length ? expiring.map((d) => <div className="store-doc-row" key={d.id}><div><strong>{d.nombre}</strong><small>Vence {formatDate(d.fecha_vencimiento)}</small></div><span className={daysUntil(d.fecha_vencimiento) <= 7 ? "danger-text" : ""}>{daysUntil(d.fecha_vencimiento)} días</span></div>) : <p className="store-empty-copy">Sin documentos próximos a vencer.</p> : <p className="store-empty-copy">Consulta disponible para el administrador de tienda.</p>}</section><section className="panel"><header className="panel__header"><h2>Accesos rápidos</h2></header><Quick icon={Users} text="Gestionar personal" action={() => onNavigate("usuarios")} /><Quick icon={CalendarCheck2} text="Registrar asistencia" action={() => onNavigate("asistencias")} /><Quick icon={GraduationCap} text="Revisar capacitaciones" action={() => onNavigate("capacitaciones")} /><Quick icon={AlertTriangle} text="Ver incidencias" action={() => onNavigate("incidencias-tienda")} /></section></div></div>
    </div>
  </section>;
}

function DashboardPersonnelKpi({ label, value, detail }) { return <article className="store-dashboard-personnel-kpi"><div><strong>{label}</strong><small>{detail}</small></div><b>{value}</b></article>; }
function DashboardPairedKpi({ label, first, second }) { return <article className="store-dashboard-paired-kpi"><h3>{label}</h3><div><span><strong>{first.value}</strong><small>{first.label}</small></span><span><strong>{second.value}</strong><small>{second.label}</small></span></div></article>; }
function DashboardSection({ kicker, title, text }) { return <header className="store-dashboard-section"><div><span>{kicker}</span><h2>{title}</h2></div><p>{text}</p></header>; }

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

function AttendanceMatrix({ people, errors, onNavigate }) {
  const currentDate = todayISO();
  const [year, setYear] = useState(currentDate.slice(0, 4));
  const [monthNumber, setMonthNumber] = useState(currentDate.slice(5, 7));
  const [workerId, setWorkerId] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [week, setWeek] = useState("");
  const [day, setDay] = useState("");
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
    api(`/asistencias/historial?desde=${year}-01-01&hasta=${year}-12-31&estado_usuario=todos&orden=asc`)
      .then((rows) => { if (!active) return; recordsCache.current.set(year, rows); setRecords(rows); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoadingRecords(false); });
    return () => { active = false; };
  }, [year]);

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
    setWorkerId(""); setIncludeInactive(false); setWeek(""); setDay("");
  };

  return <><section className={`panel attendance-matrix-panel ${expanded ? "attendance-matrix-panel--expanded" : ""}`}>
    <header className="panel__header attendance-matrix-header">
      <div><span className="eyebrow">Control mensual</span><h2>Matriz de asistencia · {monthNames[Number(monthNumber) - 1]} {year}</h2><p>Resumen diario del personal de la tienda.</p></div>
      <div className="attendance-matrix-actions">
        <button className="button button--ghost button--small" onClick={() => onNavigate("asistencias")}>Gestionar asistencia</button>
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
              <div className="attendance-matrix-person"><span className="avatar">{person.nombres?.charAt(0).toUpperCase()}</span><div><strong>{person.nombres} {person.apellidos}</strong><small>{person.rol === "jefe_tienda" ? "Administrador de tienda" : person.rol?.replaceAll("_", " ")}</small></div></div>
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
      <header className="panel__header"><div><span className="eyebrow">Equipo</span><h2>Rotación de Personal por Mes · {year}</h2><p>Ingresos y salidas mensuales de la tienda.</p></div><div className="personnel-chart-actions"><span className="panel-tag">{totalEntries} ingresos · {totalExits} salidas</span><button className="icon-button" onClick={() => setExpandedChart(expandedChart === "rotation" ? "" : "rotation")} aria-label={expandedChart === "rotation" ? "Cerrar vista ampliada" : "Ampliar rotación"}>{expandedChart === "rotation" ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div></header>
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

function Quick({ icon: Icon, text, action }) { return <button className="store-quick-row" onClick={action}><Icon size={16} /><span>{text}</span><strong>Ir</strong></button>; }
function daysUntil(value) { return Math.ceil((new Date(`${value}T12:00:00`) - new Date()) / 86400000); }
