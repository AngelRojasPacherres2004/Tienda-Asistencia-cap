import { useEffect, useMemo, useState } from "react";
import { api, formatDate, formatDateTime, todayISO } from "../lib/api";
import { EmptyState, Loading, Modal, Notice, Pagination, StatusBadge } from "./UI";
import { ClipboardCheck } from "lucide-react";
import "./zonal-requirements.css";
import { requirementCode as code, requirementAuthor as name, isRequirementOverdue, filterRequirements } from "../lib/requirementFilters";

const statuses = { pendiente: "Pendiente", en_proceso: "En proceso", atendido: "Atendido", cancelado: "Cancelado" };
const urgency = { urgente: "Urgente", corto_plazo: "Corto plazo", mediano_plazo: "Mediano plazo", largo_plazo: "Largo plazo" };
const defaults = { search: "", store: "", status: "", urgency: "", area: "", from: "", to: "", late: false, order: "gestion" };
const overdue = row => isRequirementOverdue(row, todayISO());

export default function ZonalRequirements() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [filters, setFilters] = useState(defaults);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [fileError, setFileError] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");
  const [response, setResponse] = useState({ estado: "", comentario: "" });
  const open = row => { setSelected(row); setFileError(""); setSaveError(""); setSuccess(""); setResponse({ estado: row.estado === "pendiente" ? "en_proceso" : row.estado, comentario: "" }); };
  const save = async event => {
    event.preventDefault();
    if (saving || !response.comentario.trim()) return;
    setSaving(true); setSaveError(""); setSuccess("");
    try {
      const result = await api(`/zonal/requerimientos/${selected.id}/seguimiento`, { method: "POST", body: { ...response, comentario: response.comentario.trim(), estado_anterior: selected.estado, version: selected.updated_at } });
      const updated = { ...selected, ...result.requerimiento, seguimientos: [...(selected.seguimientos || []), result.seguimiento] };
      setData(current => ({ ...current, requerimientos: current.requerimientos.map(row => row.id === updated.id ? updated : row) }));
      setSelected(updated); setResponse({ estado: updated.estado, comentario: "" });
      setSuccess(`Seguimiento guardado para ${code(updated)}. La tienda lo verá al actualizar sus requerimientos.`);
    } catch (err) { setSaveError(err.message); }
    finally { setSaving(false); }
  };
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(""); setSelected(null); setPage(1);
    api("/zonal/requerimientos", { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [refresh]);
  const change = (key, value) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); };
  const areas = [...new Set((data?.requerimientos || []).flatMap(row => row.areas_responsables || []))].sort();
  const invalidDates = filters.from && filters.to && filters.from > filters.to;
  const rows = useMemo(() => filterRequirements(data?.requerimientos || [], filters, todayISO()), [data, filters]);
  const openFile = async (row, entry) => {
    setFileBusy(true); setFileError("");
    try {
      const result = await api("/zonal/requerimientos/archivo-url", { method: "POST", body: { requerimiento_id: row.id, seguimiento_id: entry?.id } });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (err) { setFileError(err.message); }
    finally { setFileBusy(false); }
  };
  if (!data) return error ? <Notice type="error">{error} <button className="button button--ghost" onClick={() => setRefresh(value => value + 1)}>Reintentar</button></Notice> : <Loading />;
  return <section className="zonal-requirements">
    <header className="zonal-requirements__heading"><div><h2>Requerimientos de las tiendas</h2><p>Pedidos registrados por las tiendas de tu alcance. Gestiona la atención, deja una respuesta y consulta el historial.</p></div><button className="button button--ghost" onClick={() => setRefresh(value => value + 1)}>Actualizar</button></header>
    {success && <Notice type="success">{success}</Notice>}
    <div className="zonal-requirements__summary">{Object.entries(statuses).map(([status, label]) => <button key={status} type="button" aria-pressed={filters.status === status} onClick={() => change("status", filters.status === status ? "" : status)}><span>{label}</span><strong>{data.requerimientos.filter(row => row.estado === status).length}</strong></button>)}</div>
    <details className="zonal-requirements__guide"><summary>Estados y qué verá el administrador de tienda</summary><p><b>Pendiente:</b> aún no se inicia la gestión. <b>En proceso:</b> revisión o coordinación en curso. <b>Atendido:</b> solución entregada. <b>Cancelado:</b> pedido que no continuará; indica el motivo. La tienda conserva estos mismos estados y puede leer la respuesta en su seguimiento. Para corregir o reabrir un pedido, registra el nuevo estado y explica el motivo.</p></details>
    <div className="zonal-requirements__filters">
      <label>Buscar<input type="search" placeholder="Código, pedido, tienda o autor" value={filters.search} onChange={event => change("search", event.target.value)} /></label>
      <label>Tienda<select value={filters.store} onChange={event => change("store", event.target.value)}><option value="">Todas mis tiendas</option>{data.tiendas.map(store => <option key={store.id} value={store.id}>{store.nombre}</option>)}</select></label>
      <label>Estado<select value={filters.status} onChange={event => change("status", event.target.value)}><option value="">Todos los estados</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Urgencia<select value={filters.urgency} onChange={event => change("urgency", event.target.value)}><option value="">Todas las urgencias</option>{Object.entries(urgency).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Área responsable<select value={filters.area} onChange={event => change("area", event.target.value)}><option value="">Todas las áreas</option>{areas.map(area => <option key={area}>{area}</option>)}</select></label>
      <label>Fecha de inicio desde<input type="date" value={filters.from} onChange={event => change("from", event.target.value)} /></label>
      <label>Fecha de inicio hasta<input type="date" min={filters.from || undefined} value={filters.to} onChange={event => change("to", event.target.value)} /></label>
      <label>Ordenar por<select value={filters.order} onChange={event => change("order", event.target.value)}><option value="gestion">Prioridad de atención</option><option value="recientes">Más recientes</option><option value="urgencia">Urgencia</option><option value="objetivo">Fecha objetivo</option></select></label>
    </div>
    <div className="zonal-requirements__tools"><label><input type="checkbox" checked={filters.late} onChange={event => change("late", event.target.checked)} /> Solo vencidos sin atender</label><button className="button button--ghost button--small" onClick={() => { setFilters(defaults); setPage(1); }}>Limpiar filtros</button><span>{rows.length} de {data.requerimientos.length} requerimientos · {rows.filter(overdue).length} vencidos</span></div>
    {invalidDates ? <Notice type="error">La fecha desde no puede ser posterior a la fecha hasta.</Notice> : !rows.length ? <EmptyState icon={ClipboardCheck} title={data.requerimientos.length ? "Sin coincidencias" : "Sin requerimientos"} text={data.requerimientos.length ? "Prueba con otros filtros." : "Los pedidos registrados por tus tiendas aparecerán aquí."} /> : <>
      <div className="zonal-requirements__table" role="region" aria-label="Requerimientos por tienda" tabIndex={0}><table><thead><tr><th>Tienda / pedido</th><th>Estado y urgencia</th><th>Área responsable</th><th>Fecha objetivo</th><th>Última respuesta</th><th>Acción</th></tr></thead><tbody>{rows.slice((page - 1) * 10, page * 10).map(row => {
        const latest = [...(row.seguimientos || [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || Number(b.id) - Number(a.id))[0];
        return <tr key={row.id}>
          <td><strong>{row.tienda_nombre}</strong><small>{code(row)} · {name(row.autor)}</small><p>{row.requerimiento}</p><small>Cantidad: {row.cantidad ?? "No indicada"}</small></td>
          <td><StatusBadge value={row.estado} label={statuses[row.estado]} /><small className={row.urgencia === "urgente" ? "zonal-requirements__late" : undefined}>{urgency[row.urgencia]}</small></td>
          <td>{row.areas_responsables?.join(", ") || "Sin área"}</td>
          <td>{row.fecha_fin_objetivo ? formatDate(row.fecha_fin_objetivo) : "Sin fecha"}{overdue(row) && <strong className="zonal-requirements__late">Vencido</strong>}<small>Inicio: {formatDate(row.fecha_inicio)}</small></td>
          <td>{latest ? <><p className="zonal-requirements__preview">{latest.comentario}</p><small>{name(latest.usuarios)} · {formatDateTime(latest.created_at)}</small></> : <small>Sin seguimiento</small>}</td>
          <td><button className="button button--primary button--small" onClick={() => open(row)}>{["atendido", "cancelado"].includes(row.estado) ? "Ver / reabrir" : "Gestionar"}</button></td>
        </tr>;
      })}</tbody></table></div><Pagination page={page} pages={Math.max(1, Math.ceil(rows.length / 10))} onChange={setPage} />
    </>}
    <Modal open={!!selected} wide title={selected ? `${code(selected)} · ${selected.tienda_nombre}` : "Requerimiento"} onClose={() => { if (!saving) setSelected(null); }}>
      {selected && <div className="zonal-requirements__detail">
        <h3>{selected.requerimiento}</h3><StatusBadge value={selected.estado} label={statuses[selected.estado]} />
        <p>{urgency[selected.urgencia]} · Cantidad: {selected.cantidad ?? "No indicada"}</p><p>Áreas responsables: {selected.areas_responsables?.join(", ") || "Sin área"}</p>
        <p>Inicio: {formatDate(selected.fecha_inicio)} · Objetivo: {selected.fecha_fin_objetivo ? formatDate(selected.fecha_fin_objetivo) : "Sin fecha"}</p><p>Registrado por: {name(selected.autor)}</p>
        {selected.comentario && <p className="zonal-requirements__comment">{selected.comentario}</p>}
        {fileError && <Notice type="error">{fileError}</Notice>}
        {selected.evidencia_path && <button className="button button--ghost" disabled={fileBusy} onClick={() => openFile(selected)}>Ver evidencia inicial</button>}
        <form className="zonal-requirements__response" onSubmit={save}>
          <h3>Registrar atención</h3>
          <p>La tienda verá el estado y el comentario en su seguimiento. Guarda “Atendido” solo cuando hayas resuelto el pedido.</p>
          <label>Estado que verá la tienda<select disabled={saving} value={response.estado} onChange={event => setResponse(current => ({ ...current, estado: event.target.value }))}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Respuesta / acción realizada *<textarea required maxLength={4000} rows={4} disabled={saving} value={response.comentario} onChange={event => setResponse(current => ({ ...current, comentario: event.target.value }))} placeholder="Indica qué se revisó, la coordinación realizada, la solución o el motivo de cancelación o reapertura." /></label>
          {saveError && <Notice type="error">{saveError}</Notice>}
          {success && <Notice type="success">{success}</Notice>}
          <button type="submit" className="button button--primary" disabled={saving || !response.comentario.trim()}>{saving ? "Guardando…" : "Guardar estado y respuesta"}</button>
        </form>
        <h3>Historial de seguimiento</h3>
        {selected.seguimientos?.length ? [...selected.seguimientos].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map(entry => <article key={entry.id}>
          <strong>{name(entry.usuarios)}</strong><p>{formatDateTime(entry.created_at)}</p><StatusBadge value={entry.estado} label={statuses[entry.estado]} /><p className="zonal-requirements__comment">{entry.comentario}</p>
          {entry.evidencia_path && <button className="button button--ghost button--small" disabled={fileBusy} onClick={() => openFile(selected, entry)}>Ver evidencia del seguimiento</button>}
        </article>) : <p>Sin seguimientos registrados.</p>}
      </div>}
    </Modal>
  </section>;
}
