import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, BookOpenCheck, Building2, CalendarCheck2, ClipboardCheck, Download,
  FileCheck2, FileText, GraduationCap, ListChecks, Search, ShieldAlert, Sparkles, UsersRound,
} from "lucide-react";
import { api, downloadFile, formatDate, todayISO } from "../lib/api";
import { EmptyState, Loading, Modal, Notice, PageHeader, StatusBadge } from "../components/UI";

const reportDefinitions = {
  personal: {
    label: "Personal", description: "Equipo y administradores asignados a cada tienda.", icon: UsersRound,
    columns: [["nombre", "Persona"], ["tienda", "Tienda"], ["rol", "Cargo"], ["dni", "DNI"], ["fecha_ingreso", "Ingreso", "date"], ["estado", "Estado", "status"]],
  },
  asistencias: {
    label: "Asistencia", description: "Asistencias, tardanzas, faltas y observaciones.", icon: CalendarCheck2,
    columns: [["fecha", "Fecha", "date"], ["tienda", "Tienda"], ["trabajador", "Trabajador"], ["estado", "Estado", "status"], ["observaciones", "Observación"]],
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
  bitacora: {
    label: "Bitácora", description: "Cierre diario, ventas, tráfico y eventos de tienda.", icon: Activity,
    columns: [["fecha", "Fecha", "date"], ["tienda", "Tienda"], ["categoria", "Categoría"], ["evento", "Evento"], ["venta_dia", "Venta del día", "money"], ["trafico", "Tráfico"]],
  },
  requerimientos: {
    label: "Requerimientos", description: "Necesidades de tienda y estado de atención.", icon: ClipboardCheck,
    columns: [["codigo", "Código"], ["tienda", "Tienda"], ["requerimiento", "Requerimiento"], ["urgencia", "Urgencia"], ["fecha_inicio", "Inicio", "date"], ["estado", "Estado", "status"]],
  },
  mejoras: {
    label: "Mejoras", description: "Mejoras continuas registradas por las tiendas.", icon: Sparkles,
    columns: [["fecha", "Fecha", "date"], ["tienda", "Tienda"], ["seccion", "Sección"], ["area", "Área"], ["responsable", "Responsable"], ["estado", "Estado", "status"]],
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
  mejoras: [["registrada", "Registrada"], ["en_progreso", "En progreso"], ["completada", "Completada"]],
  supervisiones: [["por_validar", "Por validar"], ["en_seguimiento", "En seguimiento"], ["cerrada", "Cerrada"]],
  capacitaciones: [["pendiente", "Pendiente"], ["en_curso", "En curso"], ["completado", "Completado"]],
  tareas: [["pendiente", "Pendiente"], ["en_progreso", "En progreso"], ["completada", "Completada"], ["cancelada", "Cancelada"]],
};

const initialFilters = { q: "", tienda_id: "", desde: "", hasta: "", estado: "" };

export default function Reportes({ user }) {
  const [kind, setKind] = useState("personal");
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [rows, setRows] = useState(null);
  const [stores, setStores] = useState([]);
  const [notice, setNotice] = useState(null);
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);
  const canSelectStore = ["gerencia_general", "gerente_comercial", "jefe_zonal"].includes(user?.rol);
  const definition = reportDefinitions[kind];

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
    setKind(next); setDraft(initialFilters); setFilters(initialFilters); setSelected(null);
  };
  const applyFilters = (event) => { event.preventDefault(); setFilters(draft); };
  const clearFilters = () => { setDraft(initialFilters); setFilters(initialFilters); };
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

  return <>
    <PageHeader
      eyebrow={user?.rol === "jefe_tienda" ? "Mi tienda" : "Consulta y exportación"}
      title="Reportes"
      subtitle="Consulta la información registrada por las tiendas y descarga cada reporte en Excel."
      action={<button className="button button--primary" disabled={exporting || !rows} onClick={exportExcel}><Download size={16}/>{exporting ? "Generando…" : "Descargar Excel"}</button>}
    />
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}

    <section className="report-picker" aria-label="Tipos de reporte">
      {Object.entries(reportDefinitions).map(([id, item]) => {
        const Icon = item.icon;
        return <button key={id} className={kind === id ? "active" : ""} onClick={() => selectReport(id)}>
          <span><Icon size={18}/></span><strong>{item.label}</strong><small>{item.description}</small>
        </button>;
      })}
    </section>

    <section className="panel report-workspace">
      <header className="report-workspace__header">
        <div><span className="eyebrow">Reporte seleccionado</span><h2>{definition.label}</h2><p>{definition.description}</p></div>
        <strong className="report-count">{rows ? rows.length : "—"} registros</strong>
      </header>

      <form className="report-filters" onSubmit={applyFilters}>
        <label className="report-search"><span>Buscar</span><div><Search size={16}/><input value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} placeholder="Código, persona, tienda o detalle"/></div></label>
        {canSelectStore && <label><span>Tienda</span><select value={draft.tienda_id} onChange={(event) => setDraft({ ...draft, tienda_id: event.target.value })}><option value="">Todas las tiendas</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.nombre}</option>)}</select></label>}
        <label><span>Desde</span><input type="date" value={draft.desde} onChange={(event) => setDraft({ ...draft, desde: event.target.value })}/></label>
        <label><span>Hasta</span><input type="date" max={todayISO()} value={draft.hasta} onChange={(event) => setDraft({ ...draft, hasta: event.target.value })}/></label>
        {statusOptions[kind] && <label><span>Estado</span><select value={draft.estado} onChange={(event) => setDraft({ ...draft, estado: event.target.value })}><option value="">Todos los estados</option>{statusOptions[kind].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <div className="report-filter-actions"><button type="button" className="button button--ghost button--small" onClick={clearFilters}>Limpiar filtros</button><button className="button button--primary button--small">Aplicar filtros</button></div>
      </form>

      {!rows ? <Loading label="Preparando reporte…"/> : rows.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr>{definition.columns.map(([key, label]) => <th key={key}>{label}</th>)}<th>Detalle</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? `${kind}-${index}`}>{definition.columns.map(([key,, type]) => <td key={key}>{renderValue(row[key], type)}</td>)}<td><button className="report-detail-button" onClick={() => setSelected(row)}>Ver</button></td></tr>)}</tbody></table></div> : <EmptyState icon={Building2} title="Sin resultados" text="No hay registros que coincidan con los filtros seleccionados."/>}
    </section>

    <Modal open={!!selected} wide title={`Detalle · ${definition.label}`} subtitle="Información incluida en el reporte" onClose={() => setSelected(null)}>
      {selected && <dl className="report-detail-grid">{definition.columns.map(([key, label, type]) => <div key={key}><dt>{label}</dt><dd>{renderValue(selected[key], type)}</dd></div>)}</dl>}
    </Modal>
  </>;
}

function renderValue(value, type) {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "date") return formatDate(value);
  if (type === "money") return `S/ ${Number(value).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;
  if (type === "status") return <StatusBadge value={value}/>;
  return String(value);
}
