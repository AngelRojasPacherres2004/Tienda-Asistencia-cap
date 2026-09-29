import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock3, Download, Search } from "lucide-react";
import { EmptyState, Pagination, StatusBadge } from "./UI";
import { formatDate } from "../lib/api";

const dayDistance = (date) => date ? Math.ceil((new Date(`${date}T12:00:00`).getTime() - new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00`).getTime()) / 86400000) : null;
const deadlineLabel = (date, state) => {
  if (!date) return "Sin fecha límite";
  if (state === "levantada") return `Cerrada · ${formatDate(date)}`;
  const days = dayDistance(date);
  if (days < 0) return `Vencida hace ${Math.abs(days)} ${Math.abs(days) === 1 ? "día" : "días"}`;
  if (days === 0) return "Vence hoy";
  return `Vence en ${days} ${days === 1 ? "día" : "días"}`;
};

export default function AuditObservationCenter({ observations, visits, onLift, onViewFile, onExport }) {
  const [view, setView] = useState("observaciones");
  const [status, setStatus] = useState("pendientes");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const visitById = useMemo(() => new Map(visits.map((visit) => [visit.id, visit])), [visits]);
  const pending = observations.filter((row) => !["levantada"].includes(row.estado));
  const overdue = pending.filter((row) => dayDistance(row.fecha_limite) < 0);
  const validation = observations.filter((row) => row.estado === "en_validacion");
  const filtered = observations.filter((row) => {
    const matchesStatus = status === "todos" || status === "pendientes" && row.estado !== "levantada" || row.estado === status;
    return matchesStatus && JSON.stringify(row).toLowerCase().includes(search.toLowerCase());
  });
  const pages = Math.max(1, Math.ceil(filtered.length / 6));
  const visible = filtered.slice((page - 1) * 6, page * 6);
  const visitPages = Math.max(1, Math.ceil(visits.length / 5));
  const visibleVisits = visits.slice((page - 1) * 5, page * 5);
  const changeView = (next) => { setView(next); setPage(1); };

  return <section className="audit-center">
    <div className="audit-center__metrics"><article><ClipboardCheck size={19}/><span><small>Auditorías recibidas</small><strong>{visits.length}</strong></span></article><article><AlertTriangle size={19}/><span><small>Pendientes</small><strong>{pending.length}</strong></span></article><article className={overdue.length ? "danger" : ""}><Clock3 size={19}/><span><small>Fuera de plazo</small><strong>{overdue.length}</strong></span></article><article><CheckCircle2 size={19}/><span><small>Por validar</small><strong>{validation.length}</strong></span></article></div>
    <div className="audit-center__tabs"><button className={view === "observaciones" ? "active" : ""} onClick={() => changeView("observaciones")}>Observaciones y levantamientos</button><button className={view === "historial" ? "active" : ""} onClick={() => changeView("historial")}>Historial de auditorías</button><button className="button button--ghost" onClick={onExport}><Download size={15}/>Descargar reporte</button></div>
    {view === "observaciones" && <><div className="audit-center__filters"><label><Search size={15}/><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar criterio u observación"/></label><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="pendientes">Pendientes</option><option value="todos">Todos los estados</option><option value="abierta">Abiertas</option><option value="rechazada">Rechazadas</option><option value="en_validacion">Por validar</option><option value="levantada">Cerradas</option></select></div>{visible.length ? <div className="audit-observation-list">{visible.map((row) => { const visit = visitById.get(row.visita_id); const canLift = ["abierta", "en_proceso", "rechazada"].includes(row.estado); const isOverdue = dayDistance(row.fecha_limite) < 0 && row.estado !== "levantada"; return <article className={isOverdue ? "is-overdue" : ""} key={row.id}><header><div><span>OBS-{String(row.id).padStart(4, "0")}</span><h3>{row.area_item}</h3></div><StatusBadge value={row.estado}/></header><p>{row.descripcion}</p>{row.accion_solicitada && <aside><strong>Acción solicitada</strong><span>{row.accion_solicitada}</span></aside>}<footer><div><span className={`priority priority--${row.prioridad}`}>{row.prioridad}</span><strong className={isOverdue ? "danger" : ""}>{deadlineLabel(row.fecha_limite, row.estado)}</strong><small>{visit ? `Auditoría ${formatDate(visit.fecha)} · ${visit.puntaje ?? 0}%` : "Auditoría zonal"}</small></div><div>{row.evidencia_cierre_path && <button onClick={() => onViewFile(row.evidencia_cierre_path)}>Ver evidencia</button>}{canLift && <button className="button button--primary" onClick={() => onLift(row)}>Levantar observación</button>}{row.estado === "en_validacion" && <span className="audit-waiting">Esperando validación del Zonal</span>}</div></footer>{row.estado === "rechazada" && row.comentario_validacion && <div className="audit-rejected"><strong>Corrección solicitada por el Zonal</strong><span>{row.comentario_validacion}</span></div>}</article>; })}</div> : <EmptyState icon={CheckCircle2} title="Sin observaciones en este estado" text="No hay acciones pendientes con los filtros seleccionados."/>}<Pagination page={page} pages={pages} onChange={setPage}/></>}
    {view === "historial" && <>{visibleVisits.length ? <div className="audit-history-list">{visibleVisits.map((visit) => { const related = observations.filter((row) => row.visita_id === visit.id); const open = related.filter((row) => row.estado !== "levantada").length; return <article key={visit.id}><div className="audit-history-score"><strong>{visit.puntaje ?? 0}%</strong><small>resultado</small></div><div><span>SUP-{String(visit.id).padStart(4, "0")}</span><h3>{visit.periodo?.replaceAll("_", " ") || "Auditoría zonal"}</h3><p>{formatDate(visit.fecha)} · {visit.usuarios ? `${visit.usuarios.nombres || ""} ${visit.usuarios.apellidos || ""}`.trim() : "Jefe zonal"}</p></div><div><StatusBadge value={open ? "en_seguimiento" : "cerrada"}/><small>{related.length} observaciones · {open} pendientes</small></div></article>; })}</div> : <EmptyState icon={ClipboardCheck} title="Sin auditorías" text="Cuando el Zonal registre una revisión aparecerá en este historial."/>}<Pagination page={page} pages={visitPages} onChange={setPage}/></>}
  </section>;
}
