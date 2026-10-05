import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck, Building2, CalendarCheck2, ClipboardCheck, Download,
  FileCheck2, FileText, GraduationCap, ListChecks, Search, ShieldAlert, UsersRound,
} from "lucide-react";
import { api, downloadFile, formatDate, todayISO } from "../lib/api";
import { EmptyState, Loading, Modal, Notice, PageHeader, Pagination, StatusBadge } from "../components/UI";

const reportDefinitions = {
  personal: {
    label: "Personal", description: "Equipo y administradores asignados a cada tienda.", icon: UsersRound,
    columns: [["nombre", "Persona"], ["tienda", "Tienda"], ["rol", "Cargo"], ["dni", "DNI"], ["fecha_ingreso", "Ingreso", "date"], ["estado", "Estado", "status"]],
  },
  asistencias: {
    label: "Asistencia", description: "Asistencias, tardanzas, faltas y observaciones.", icon: CalendarCheck2,
    columns: [["fecha", "Fecha", "date"], ["tienda", "Tienda"], ["trabajador", "Trabajador"], ["estado", "Estado", "status"], ["observaciones", "Observación"]],
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

export default function Reportes({ user, initialKind = "personal", allowedKinds = null, embedded = false, fixedStoreId = "" }) {
  const availableKinds = useMemo(() => {
    const roleKinds = reportKindsByRole[user?.rol] || Object.keys(reportDefinitions);
    return allowedKinds?.length ? allowedKinds.filter(id => reportDefinitions[id] && roleKinds.includes(id)) : roleKinds;
  }, [allowedKinds, user?.rol]);
  const startingKind = availableKinds.includes(initialKind) ? initialKind : availableKinds[0];
  const baseFilters = { ...initialFilters, tienda_id: fixedStoreId ? String(fixedStoreId) : "" };
  const [kind, setKind] = useState(startingKind);
  const [draft, setDraft] = useState(baseFilters);
  const [filters, setFilters] = useState(baseFilters);
  const [rows, setRows] = useState(null);
  const [stores, setStores] = useState([]);
  const [notice, setNotice] = useState(null);
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
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

  const load = useCallback(() => {
    setRows(null); setNotice(null);
    api(`/reportes/${kind}${query ? `?${query}` : ""}`)
      .then((result) => setRows(result.rows || []))
      .catch((error) => { setRows([]); setNotice({ type: "error", text: error.message }); });
  }, [kind, query]);
  useEffect(() => { load(); }, [load]);

  const selectReport = (next) => {
    const nextFilters = { ...initialFilters, tienda_id: fixedStoreId ? String(fixedStoreId) : "" };
    setKind(next); setDraft(nextFilters); setFilters(nextFilters); setSelected(null); setPage(1);
  };
  const applyFilters = (event) => { event.preventDefault(); setFilters(draft); setPage(1); };
  const clearFilters = () => { const next = { ...initialFilters, tienda_id: fixedStoreId ? String(fixedStoreId) : "" }; setDraft(next); setFilters(next); setPage(1); };
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
      subtitle="Consulta la información registrada por las tiendas y descarga cada reporte en Excel."
      action={exportButton}
    />}
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}

    {availableKinds.length > 1 && <section className="report-picker" aria-label="Tipos de reporte">
      {availableKinds.map((id) => {
        const item = reportDefinitions[id];
        const Icon = item.icon;
        return <button key={id} className={kind === id ? "active" : ""} onClick={() => selectReport(id)}>
          <span><Icon size={18}/></span><strong>{item.label}</strong><small>{item.description}</small>
        </button>;
      })}
    </section>}

    <section className="panel report-workspace">
      <header className="report-workspace__header">
        <div><span className="eyebrow">Reporte seleccionado</span><h2>{definition.label}</h2><p>{definition.description}</p></div>
        <div className="report-workspace__actions"><strong className="report-count">{rows ? rows.length : "—"} registros</strong>{embedded && exportButton}</div>
      </header>

      <form className="report-filters" onSubmit={applyFilters}>
        <label className="report-search"><span>Buscar</span><div><Search size={16}/><input value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} placeholder="Código, persona, tienda o detalle"/></div></label>
        {canSelectStore && <label><span>Tienda</span><select value={draft.tienda_id} onChange={(event) => setDraft({ ...draft, tienda_id: event.target.value })}><option value="">Todas las tiendas</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.nombre}</option>)}</select></label>}
        <label><span>Desde</span><input type="date" value={draft.desde} onChange={(event) => setDraft({ ...draft, desde: event.target.value })}/></label>
        <label><span>Hasta</span><input type="date" max={todayISO()} value={draft.hasta} onChange={(event) => setDraft({ ...draft, hasta: event.target.value })}/></label>
        {statusOptions[kind] && <label><span>Estado</span><select value={draft.estado} onChange={(event) => setDraft({ ...draft, estado: event.target.value })}><option value="">Todos los estados</option>{statusOptions[kind].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <div className="report-filter-actions"><button type="button" className="button button--ghost button--small" onClick={clearFilters}>Limpiar filtros</button><button className="button button--primary button--small">Aplicar filtros</button></div>
      </form>

      {!rows ? <Loading label="Preparando reporte…"/> : rows.length ? <><div className="report-table-wrap"><table className="report-table"><thead><tr>{definition.columns.map(([key, label]) => <th key={key}>{label}</th>)}<th>Detalle</th></tr></thead><tbody>{visibleRows.map((row, index) => <tr key={row.id ?? `${kind}-${index}`}>{definition.columns.map(([key,, type]) => <td key={key}>{renderValue(row[key], type)}</td>)}<td><button className="report-detail-button" onClick={() => setSelected(row)}>Ver</button></td></tr>)}</tbody></table></div><Pagination page={page} pages={pages} onChange={setPage}/></> : <EmptyState icon={Building2} title="Sin resultados" text="No hay registros que coincidan con los filtros seleccionados."/>}
    </section>

    <Modal open={!!selected} wide title={`Detalle · ${definition.label}`} subtitle="Información incluida en el reporte" onClose={() => setSelected(null)}>
      {selected && <dl className="report-detail-grid">{definition.columns.map(([key, label, type]) => <div key={key}><dt>{label}</dt><dd>{renderValue(selected[key], type)}</dd></div>)}</dl>}
    </Modal>
  </div>;
}

function renderValue(value, type) {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "date") return formatDate(value);
  if (type === "money") return `S/ ${Number(value).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;
  if (type === "status") return <StatusBadge value={value}/>;
  return String(value);
}
