import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck, Building2, CalendarCheck2, ClipboardCheck, Download,
  FileCheck2, FileText, GraduationCap, ListChecks, Search, ShieldAlert, UsersRound,
} from "lucide-react";
import { api, downloadFile, formatDate, todayISO } from "../lib/api";
import { EmptyState, Loading, Modal, Notice, PageHeader, Pagination, StatusBadge } from "../components/UI";
import NormalizedReports from "./NormalizedReports";

const reportDefinitions = {
  personal: {
    label: "Personal", description: "Dotación por tienda, ficha laboral y resumen comparable con el registro de personal.", icon: UsersRound,
    columns: [["tienda", "Tienda"], ["nombre", "Nombres y apellidos"], ["dni", "DNI"], ["sexo", "Sexo"], ["rol", "Cargo"], ["area", "Área"], ["jornada", "Jornada"], ["fecha_ingreso", "Fecha de ingreso", "date"], ["estado", "Estado", "status"]],
  },
  asistencias: {
    label: "Asistencia", description: "Marcas por fecha, tienda y persona; el Excel incluye un consolidado para administradores.", icon: CalendarCheck2,
    columns: [["fecha", "Fecha", "date"], ["tienda", "Tienda"], ["trabajador", "Trabajador"], ["dni", "DNI"], ["estado", "Estado", "status"], ["observaciones", "Observación"]],
  },
  amonestaciones: {
    label: "Amonestaciones", description: "Medidas disciplinarias registradas por persona y tienda.", icon: ShieldAlert,
    columns: [["fecha", "Fecha", "date"], ["tienda", "Tienda"], ["trabajador", "Trabajador"], ["rol", "Cargo"], ["tipo", "Tipo"], ["motivo", "Motivo"]],
  },
  "errores-personal": {
    label: "Errores de personal", description: "Errores operativos y acciones correctivas del equipo.", icon: ClipboardCheck,
    columns: [["fecha", "Fecha", "date"], ["tienda", "Tienda"], ["trabajador", "Trabajador"], ["rol", "Cargo"], ["categoria", "Categoría"], ["accion_correctiva", "Acción correctiva"]],
  },
  documentos: {
    label: "Documentos", description: "Documentación municipal y fechas de vencimiento.", icon: FileCheck2,
    columns: [["tienda", "Tienda"], ["tipo_documento", "Documento"], ["codigo", "Código"], ["responsables", "Responsables"], ["fecha_vencimiento", "Vencimiento", "date"], ["estado", "Estado", "status"]],
  },
  incidencias: {
    label: "Incidencias", description: "Incidencias de tienda y coordinaciones entre tiendas.", icon: ShieldAlert,
    columns: [["codigo", "Código"], ["fecha", "Fecha", "date"], ["tienda", "Tienda"], ["tipo", "Tipo"], ["alcance", "Alcance"], ["estado", "Estado", "status"]],
  },
  reclamaciones: {
    label: "Reclamaciones", description: "Libro de reclamaciones y atención al consumidor.", icon: BookOpenCheck,
    columns: [["codigo", "Código"], ["fecha", "Fecha", "date"], ["tienda", "Tienda"], ["consumidor", "Consumidor"], ["tipo", "Tipo"], ["estado", "Estado", "status"]],
  },
  acciones: {
    label: "Acciones", description: "Planes, activaciones y acciones operativas.", icon: ListChecks,
    columns: [["fecha", "Fecha", "date"], ["tienda", "Tienda"], ["accion", "Acción"], ["tipo", "Tipo"], ["responsable", "Responsable"], ["estado", "Estado", "status"]],
  },
  requerimientos: {
    label: "Requerimientos", description: "Necesidades de tienda y estado de atención.", icon: ClipboardCheck,
    columns: [["codigo", "Código"], ["tienda", "Tienda"], ["requerimiento", "Requerimiento"], ["urgencia", "Urgencia"], ["fecha_inicio", "Inicio", "date"], ["estado", "Estado", "status"]],
  },
  supervisiones: {
    label: "Supervisiones", description: "Visitas, puntajes y observaciones zonales.", icon: ClipboardCheck,
    columns: [["codigo", "Código"], ["fecha", "Fecha", "date"], ["tienda", "Tienda"], ["administrador", "Administrador"], ["puntaje", "Puntaje"], ["estado", "Estado", "status"]],
  },
  capacitaciones: {
    label: "Capacitaciones", description: "Avance, notas y finalización de cursos.", icon: GraduationCap,
    columns: [["tienda", "Tienda"], ["trabajador", "Trabajador"], ["curso", "Curso"], ["avance", "Avance"], ["nota", "Nota"], ["estado", "Estado", "status"]],
  },
  tareas: {
    label: "Tareas", description: "Cronogramas y cumplimiento de tareas zonales.", icon: FileText,
    columns: [["tienda", "Tienda"], ["titulo", "Tarea"], ["responsable", "Responsable"], ["fecha_limite", "Fecha límite", "date"], ["prioridad", "Prioridad", "status"], ["estado", "Estado", "status"]],
  },
};

const statusOptions = {
  personal: [["activo", "Activo"], ["inactivo", "Inactivo"]],
  asistencias: [["presente", "Asistencia"], ["tardanza", "Tardanza"], ["medio_turno", "Medio turno"], ["apoyo", "Apoyo"], ["falta", "Falta"], ["permiso", "Permiso"], ["descanso_medico", "Descanso médico"], ["suspension", "Suspensión"]],
  documentos: [["vigente", "Vigente"], ["por_vencer", "Por vencer"], ["vencido", "Vencido"], ["en_renovacion", "En renovación"]],
  incidencias: [["abierta", "Abierta"], ["en_seguimiento", "En seguimiento"], ["cerrada", "Cerrada"], ["registrado", "Registrada"], ["en_revision", "En revisión"], ["resuelto", "Resuelta"]],
  reclamaciones: [["registrado", "Registrado"], ["en_atencion", "En atención"], ["respondido", "Respondido"], ["cerrado", "Cerrado"]],
  acciones: [["pendiente", "Pendiente"], ["en_progreso", "En progreso"], ["completada", "Completada"], ["cancelada", "Cancelada"]],
  requerimientos: [["pendiente", "Pendiente"], ["en_proceso", "En proceso"], ["atendido", "Atendido"], ["cancelado", "Cancelado"]],
  supervisiones: [["por_validar", "Por validar"], ["en_seguimiento", "En seguimiento"], ["cerrada", "Cerrada"]],
  capacitaciones: [["pendiente", "Pendiente"], ["en_curso", "En curso"], ["completado", "Completado"]],
  tareas: [["pendiente", "Pendiente"], ["en_progreso", "En progreso"], ["completada", "Completada"], ["cancelada", "Cancelada"]],
};

const initialFilters = { q: "", tienda_id: "", desde: "", hasta: "", estado: "" };

const reportKindsByRole = {
  jefe_tienda: ["personal", "asistencias", "amonestaciones", "errores-personal", "capacitaciones"],
  jefe_zonal: ["personal", "asistencias", "amonestaciones", "errores-personal", "incidencias", "supervisiones", "capacitaciones", "tareas"],
};

const pageSize = 8;
const reportCache = new Map();
const reportCacheMs = 30000;

export default function Reportes({ user, initialKind = "personal", allowedKinds = null, embedded = false, fixedStoreId = "" }) {
  const allowedKindsKey = allowedKinds?.join(",") || "";
  const availableKinds = useMemo(() => {
    const roleKinds = reportKindsByRole[user?.rol] || Object.keys(reportDefinitions);
    return allowedKindsKey ? allowedKindsKey.split(",").filter(id => reportDefinitions[id] && roleKinds.includes(id)) : roleKinds;
  }, [allowedKindsKey, user?.rol]);
  const startingKind = availableKinds.includes(initialKind) ? initialKind : availableKinds[0];
  const baseFilters = { ...initialFilters, tienda_id: fixedStoreId ? String(fixedStoreId) : "" };
  const [kind, setKind] = useState(startingKind);
  const [draft, setDraft] = useState(baseFilters);
  const [filters, setFilters] = useState(baseFilters);
  const [rows, setRows] = useState(null);
  const [stores, setStores] = useState([]);
  const [notice, setNotice] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [group, setGroup] = useState("cifras");
  const hasCommercialReports = !embedded && ["gerente_comercial", "jefe_zonal", "jefe_tienda"].includes(user?.rol);
  const commercialSelected = hasCommercialReports && group === "cifras";
  const canSelectStore = !fixedStoreId && ["gerencia_general", "gerente_comercial", "jefe_zonal"].includes(user?.rol);
  const definition = reportDefinitions[kind];

  useEffect(() => {
    const nextKind = availableKinds.includes(initialKind) ? initialKind : availableKinds[0];
    const nextFilters = { ...initialFilters, tienda_id: fixedStoreId ? String(fixedStoreId) : "" };
    setKind(nextKind); setDraft(nextFilters); setFilters(nextFilters); setSelected(null); setPage(1);
  }, [availableKinds, initialKind, fixedStoreId]);

  useEffect(() => {
    if (canSelectStore) api("/tiendas").then(setStores).catch(() => setStores([]));
  }, [canSelectStore]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    return params.toString();
  }, [filters]);

  useEffect(() => {
    if (commercialSelected) return undefined;
    let active = true;
    const controller = new AbortController();
    const key = `${user?.id || user?.usuario}|${kind}|${query}`;
    const cached = reportCache.get(key);
    setNotice(null);
    setLoadError("");
    if (!loadAttempt && cached && Date.now() - cached.at < reportCacheMs) setRows(cached.rows);
    else {
      setRows(null);
      api(`/reportes/${kind}${query ? `?${query}` : ""}`, { signal: controller.signal })
        .then((result) => {
          const nextRows = result.rows || [];
          reportCache.set(key, { at: Date.now(), rows: nextRows });
          if (active) setRows(nextRows);
        })
        .catch((error) => { if (active) { setRows([]); setLoadError(error.message); } });
    }
    return () => { active = false; controller.abort(); };
  }, [commercialSelected, kind, query, loadAttempt, user?.id, user?.usuario]);

  const selectReport = (next) => {
    const nextFilters = { ...initialFilters, tienda_id: fixedStoreId ? String(fixedStoreId) : "" };
    setRows(null); setKind(next); setDraft(nextFilters); setFilters(nextFilters); setSelected(null); setPage(1); setLoadAttempt((value) => value + 1);
  };
  const applyFilters = (event) => { event.preventDefault(); setRows(null); setFilters(draft); setPage(1); setLoadAttempt((value) => value + 1); };
  const clearFilters = () => { const next = { ...initialFilters, tienda_id: fixedStoreId ? String(fixedStoreId) : "" }; setRows(null); setDraft(next); setFilters(next); setPage(1); setLoadAttempt((value) => value + 1); };
  const exportExcel = async () => {
    setExporting(true); setNotice(null);
    try {
      await downloadFile(`/api/reportes/${kind}/export.xlsx${query ? `?${query}` : ""}`, `reporte-${kind}-${todayISO()}.xlsx`);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setExporting(false);
    }
  };

  const pages = Math.max(1, Math.ceil((rows?.length || 0) / pageSize));
  const visibleRows = rows?.slice((page - 1) * pageSize, page * pageSize) || [];
  const exportButton = <button className="button button--primary" disabled={exporting || !rows} onClick={exportExcel}><Download size={16}/>{exporting ? "Generando…" : "Descargar Excel"}</button>;

  return <div className={embedded ? "embedded-report" : "report-page"}>
    {!embedded && <PageHeader
      eyebrow={user?.rol === "jefe_tienda" ? "Mi tienda" : "Consulta y exportación"}
      title="Reportes"
      action={commercialSelected ? null : exportButton}
    />}
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
    {hasCommercialReports && <div className="annual-reports__tabs" role="tablist" aria-label="Grupos de reportes">
      <button type="button" role="tab" aria-selected={commercialSelected} className={commercialSelected ? "is-active" : ""} onClick={() => setGroup("cifras")}>Análisis y cifras</button>
      <button type="button" role="tab" aria-selected={!commercialSelected} className={!commercialSelected ? "is-active" : ""} onClick={() => setGroup("personas")}>Personas y operación</button>
    </div>}
    {commercialSelected ? <NormalizedReports user={user}/> : <>
    {availableKinds.length > 1 && <label className="commercial-report-selector">Tipo de reporte<select value={kind} onChange={event => selectReport(event.target.value)}>{availableKinds.map(id => <option key={id} value={id}>{reportDefinitions[id].label}</option>)}</select></label>}

    <section className="panel report-workspace">
      <header className="report-workspace__header">
        <div><h2>{embedded && kind === "personal" ? "Registro de personal" : definition.label}</h2></div>
        <div className="report-workspace__actions"><strong className="report-count">{rows ? rows.length : "—"} registros</strong>{embedded && exportButton}</div>
      </header>
      {kind === "asistencias" && <p className="report-method-note">El resumen cuenta únicamente marcas registradas. Una persona sin marca no se considera automáticamente una falta.</p>}
      {rows && kind === "asistencias" && <div className="report-stat-strip">
        {[["Marcas",rows.length],["Asistencias",rows.filter(row=>row.estado==="presente").length],["Tardanzas",rows.filter(row=>row.estado==="tardanza").length],["Faltas registradas",rows.filter(row=>row.estado==="falta").length]].map(([label,value])=><div key={label}><strong>{value}</strong><span>{label}</span></div>)}
      </div>}

      <form className="report-filters" onSubmit={applyFilters}>
        <label className="report-search"><span>Buscar</span><div><Search size={16}/><input value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} placeholder="Código, persona, tienda o detalle"/></div></label>
        {canSelectStore && <label><span>Tienda</span><select value={draft.tienda_id} onChange={(event) => setDraft({ ...draft, tienda_id: event.target.value })}><option value="">Todas las tiendas</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.nombre}</option>)}</select></label>}
        <label><span>{kind === "personal" ? "Ingreso desde" : "Desde"}</span><input type="date" value={draft.desde} onChange={(event) => setDraft({ ...draft, desde: event.target.value })}/></label>
        <label><span>{kind === "personal" ? "Ingreso hasta" : "Hasta"}</span><input type="date" max={todayISO()} value={draft.hasta} onChange={(event) => setDraft({ ...draft, hasta: event.target.value })}/></label>
        {statusOptions[kind] && <label><span>Estado</span><select value={draft.estado} onChange={(event) => setDraft({ ...draft, estado: event.target.value })}><option value="">Todos los estados</option>{statusOptions[kind].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <div className="report-filter-actions"><button type="button" className="button button--ghost button--small" onClick={clearFilters}>Limpiar filtros</button><button className="button button--primary button--small">Aplicar filtros</button></div>
      </form>

      {loadError ? <div className="commercial-load-error"><Notice type="error">{loadError}</Notice><button type="button" className="button button--ghost" onClick={() => setLoadAttempt((value) => value + 1)}>Reintentar</button></div> : !rows ? <Loading label="Preparando reporte…"/> : rows.length ? <><div className="report-table-wrap"><table className="report-table"><thead><tr>{definition.columns.map(([key, label]) => <th key={key}>{label}</th>)}<th>Detalle</th></tr></thead><tbody>{visibleRows.map((row, index) => <tr key={row.id ?? `${kind}-${index}`}>{definition.columns.map(([key,, type]) => <td key={key}>{renderValue(row[key], type)}</td>)}<td><button className="report-detail-button" onClick={() => setSelected(row)}>Ver</button></td></tr>)}</tbody></table></div><Pagination page={page} pages={pages} onChange={setPage}/></> : <EmptyState icon={Building2} title="Sin resultados" text="No hay registros que coincidan con los filtros seleccionados."/>}
    </section>

    <Modal open={!!selected} wide title={`Detalle · ${definition.label}`} subtitle="Información incluida en el reporte" onClose={() => setSelected(null)}>
      {selected && <dl className="report-detail-grid">{(kind === "personal" ? [["tienda","Tienda"],["nombre","Nombres y apellidos"],["dni","DNI"],["sexo","Sexo"],["rol","Cargo"],["area","Área"],["nivel_estudios","Nivel de estudios"],["ciclo_semestre","Ciclo / semestre"],["carrera","Carrera"],["edad","Edad"],["fecha_nacimiento","Nacimiento","date"],["mes_cumpleanos","Mes de cumpleaños"],["fecha_ingreso","Fecha de ingreso","date"],["fecha_salida","Fecha de salida","date"],["motivo_salida","Motivo de salida"],["estado_civil","Estado civil"],["numero_hijos","N.º de hijos"],["telefono","Teléfono"],["direccion","Dirección"],["distrito","Distrito"],["nacionalidad","Nacionalidad"],["jornada","Jornada"],["estado","Estado","status"]] : definition.columns).map(([key, label, type]) => <div key={key}><dt>{label}</dt><dd>{renderValue(selected[key], type)}</dd></div>)}</dl>}
    </Modal>
    </>}
  </div>;
}

function renderValue(value, type) {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "date") return formatDate(value);
  if (type === "money") return `S/ ${Number(value).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;
  if (type === "status") return <StatusBadge value={value}/>;
  return String(value);
}
