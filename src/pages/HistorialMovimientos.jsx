import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, History, Search } from "lucide-react";
import { api, downloadFile, formatDateTime, todayISO } from "../lib/api";
import { EmptyState, Loading, Notice, PageHeader, StatusBadge } from "../components/UI";

const initialFilters = { q: "", tienda_id: "", modulo: "", operacion: "", desde: "", hasta: "" };

export default function HistorialMovimientos({ user }) {
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [rows, setRows] = useState(null);
  const [stores, setStores] = useState([]);
  const [notice, setNotice] = useState(null);
  const [exporting, setExporting] = useState(false);
  const canSelectStore = ["gerencia_general", "gerente_comercial", "jefe_zonal"].includes(user?.rol);
  useEffect(() => { if (canSelectStore) api("/tiendas").then(setStores).catch(() => setStores([])); }, [canSelectStore]);
  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    return params.toString();
  }, [filters]);
  const load = useCallback(() => {
    setRows(null); setNotice(null);
    api(`/movimientos${query ? `?${query}` : ""}`).then((result) => setRows(result.rows || [])).catch((error) => { setRows([]); setNotice({ type: "error", text: error.message }); });
  }, [query]);
  useEffect(() => { load(); }, [load]);
  const apply = (event) => { event.preventDefault(); setFilters(draft); };
  const clear = () => { setDraft(initialFilters); setFilters(initialFilters); };
  const exportExcel = async () => {
    setExporting(true); setNotice(null);
    try { await downloadFile(`/api/movimientos/export.xlsx${query ? `?${query}` : ""}`, `historial-movimientos-${todayISO()}.xlsx`); }
    catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { setExporting(false); }
  };
  return <>
    <PageHeader eyebrow="Trazabilidad" title="Historial de movimientos" subtitle="Consulta cambios de asistencia, seguimientos y validaciones sin mezclarlos con los formularios operativos." action={<button className="button button--primary" disabled={exporting || !rows} onClick={exportExcel}><Download size={16}/>{exporting ? "Generando…" : "Descargar Excel"}</button>}/>
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
    <form className="report-filters history-filters" onSubmit={apply}>
      <label className="report-search"><span>Buscar</span><div><Search size={16}/><input value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} placeholder="Persona, tienda o movimiento"/></div></label>
      {canSelectStore && <label><span>Tienda</span><select value={draft.tienda_id} onChange={(event) => setDraft({ ...draft, tienda_id: event.target.value })}><option value="">Todas las tiendas</option>{stores.map((store) => <option value={store.id} key={store.id}>{store.nombre}</option>)}</select></label>}
      <label><span>Módulo</span><select value={draft.modulo} onChange={(event) => setDraft({ ...draft, modulo: event.target.value })}><option value="">Todos los módulos</option><option value="asistencia">Asistencia</option><option value="requerimientos">Requerimientos</option><option value="supervisiones">Supervisiones</option><option value="incidencias">Incidencias zonales</option></select></label>
      <label><span>Operación</span><select value={draft.operacion} onChange={(event) => setDraft({ ...draft, operacion: event.target.value })}><option value="">Todas las operaciones</option><option value="creacion">Creación</option><option value="edicion">Edición</option><option value="eliminacion">Eliminación</option><option value="seguimiento">Seguimiento</option><option value="validacion">Validación</option></select></label>
      <label><span>Desde</span><input type="date" value={draft.desde} onChange={(event) => setDraft({ ...draft, desde: event.target.value })}/></label>
      <label><span>Hasta</span><input type="date" max={todayISO()} value={draft.hasta} onChange={(event) => setDraft({ ...draft, hasta: event.target.value })}/></label>
      <div className="report-filter-actions"><button type="button" className="button button--ghost button--small" onClick={clear}>Limpiar filtros</button><button className="button button--primary button--small">Aplicar filtros</button></div>
    </form>
    {!rows ? <Loading label="Cargando movimientos…"/> : rows.length ? <section className="history-timeline">{rows.map((row) => <article key={`${row.modulo}-${row.id}-${row.fecha_hora}`}><span className="history-timeline__icon"><History size={17}/></span><div><header><strong>{row.titulo}</strong><StatusBadge value={row.operacion}/></header><p>{row.detalle || "Sin detalle adicional."}</p><footer><span>{row.tienda || "Sin tienda"}</span><span>{row.realizado_por || "Sistema"}</span><time>{formatDateTime(row.fecha_hora)}</time></footer>{(row.valor_anterior || row.valor_nuevo) && <div className="history-change"><span>Antes: <strong>{row.valor_anterior || "Sin registro"}</strong></span><span>Después: <strong>{row.valor_nuevo || "Sin registro"}</strong></span></div>}</div></article>)}</section> : <EmptyState icon={History} title="Sin movimientos" text="No hay movimientos que coincidan con los filtros seleccionados."/>}
  </>;
}
