import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, History, Search } from "lucide-react";
import { api, downloadFile, formatDateTime, todayISO } from "../lib/api";
import { EmptyState, Loading, Notice, PageHeader, Pagination, StatusBadge } from "../components/UI";

const initialFilters = { q: "", tienda_id: "", modulo: "", operacion: "", resultado: "", desde: "", hasta: "" };
const moduleOptions = [["asistencia", "Asistencia"], ["requerimientos", "Requerimientos"], ["supervisiones", "Supervisiones"], ["incidencias", "Incidencias zonales"]];
const operationOptions = [["creacion", "Creación"], ["edicion", "Edición"], ["eliminacion", "Eliminación"], ["seguimiento", "Seguimiento"], ["validacion", "Validación"]];
const operationsByModule = { asistencia: ["creacion", "edicion", "eliminacion"], requerimientos: ["seguimiento"], supervisiones: ["validacion"], incidencias: ["creacion", "edicion"] };
const labelFor = (options, value) => options.find(([key]) => key === value)?.[1] || value;

export default function HistorialMovimientos({ user }) {
  const [draft, setDraft] = useState(initialFilters); const [filters, setFilters] = useState(initialFilters);
  const [rows, setRows] = useState(null); const [stores, setStores] = useState([]); const [notice, setNotice] = useState(null);
  const [exporting, setExporting] = useState(false); const [page, setPage] = useState(1);
  const canSelectStore = ["gerencia_general", "gerente_comercial", "jefe_zonal"].includes(user?.rol);
  useEffect(() => { if (canSelectStore) api("/tiendas").then(setStores).catch(() => setStores([])); }, [canSelectStore]);
  const query = useMemo(() => { const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => value && params.set(key, value)); return params.toString(); }, [filters]);
  const load = useCallback(() => { setRows(null); setNotice(null); api(`/movimientos${query ? `?${query}` : ""}`).then((result) => setRows(result.rows || [])).catch((error) => { setRows([]); setNotice({ type: "error", text: error.message }); }); }, [query]);
  useEffect(() => { load(); }, [load]);
  const apply = (event) => { event.preventDefault(); setFilters(draft); setPage(1); };
  const clear = () => { setDraft(initialFilters); setFilters(initialFilters); setPage(1); };
  const setDraftField = (key, value) => setDraft((current) => ({ ...current, [key]: value, ...(key === "modulo" && current.operacion && !operationsByModule[value]?.includes(current.operacion) ? { operacion: "" } : {}) }));
  const exportExcel = async () => { setExporting(true); setNotice(null); try { await downloadFile(`/api/movimientos/export.xlsx${query ? `?${query}` : ""}`, `historial-movimientos-${todayISO()}.xlsx`); } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setExporting(false); } };
  const resultOptions = useMemo(() => [...new Set((rows || []).map((row) => row.valor_nuevo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [rows]);
  const pages = Math.max(1, Math.ceil((rows?.length || 0) / 15)); const visibleRows = rows?.slice((page - 1) * 15, page * 15) || [];
  const operations = draft.modulo ? operationOptions.filter(([key]) => operationsByModule[draft.modulo]?.includes(key)) : operationOptions;
  return <>
    <PageHeader eyebrow="Trazabilidad" title="Historial de movimientos" subtitle="Consulta las acciones registradas por módulo, operación, tienda y período en una matriz única." action={<button className="button button--primary" disabled={exporting || !rows} onClick={exportExcel}><Download size={16}/>{exporting ? "Generando…" : "Descargar Excel"}</button>}/>
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
    <form className="report-filters history-filters" onSubmit={apply}>
      <label className="report-search"><span>Buscar</span><div><Search size={16}/><input value={draft.q} onChange={(event) => setDraftField("q", event.target.value)} placeholder="Persona, tienda o acción"/></div></label>
      {canSelectStore && <label><span>Tienda</span><select value={draft.tienda_id} onChange={(event) => setDraftField("tienda_id", event.target.value)}><option value="">Todas las tiendas</option>{stores.map((store) => <option value={store.id} key={store.id}>{store.nombre}</option>)}</select></label>}
      <label><span>Módulo</span><select value={draft.modulo} onChange={(event) => setDraftField("modulo", event.target.value)}><option value="">Todos los módulos</option>{moduleOptions.filter(([key]) => key !== "incidencias" || user?.rol !== "jefe_tienda").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label><span>Operación</span><select value={draft.operacion} onChange={(event) => setDraftField("operacion", event.target.value)}><option value="">Todas las operaciones</option>{operations.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label><span>Resultado</span><select value={draft.resultado} onChange={(event) => setDraftField("resultado", event.target.value)}><option value="">Todos los resultados</option>{resultOptions.map((result) => <option key={result} value={result}>{result}</option>)}</select></label>
      <label><span>Desde</span><input type="date" value={draft.desde} onChange={(event) => setDraftField("desde", event.target.value)}/></label>
      <label><span>Hasta</span><input type="date" max={todayISO()} value={draft.hasta} onChange={(event) => setDraftField("hasta", event.target.value)}/></label>
      <div className="report-filter-actions"><button type="button" className="button button--ghost button--small" onClick={clear}>Limpiar filtros</button><button className="button button--primary button--small">Aplicar filtros</button></div>
    </form>
    {!rows ? <Loading label="Cargando movimientos…"/> : rows.length ? <section className="history-matrix" aria-label="Matriz de acciones registradas">
      <div className="history-matrix__summary"><strong>{rows.length} acciones</strong><span>Ordenadas de la más reciente a la más antigua</span></div>
      <div className="history-matrix__scroll"><table><thead><tr><th>Fecha y hora</th><th>Módulo</th><th>Acción</th><th>Operación</th><th>Tienda</th><th>Realizado por</th><th>Antes → después</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={`${row.modulo}-${row.id}-${row.fecha_hora}`}><td><time>{formatDateTime(row.fecha_hora)}</time></td><td><span className="history-matrix__module">{labelFor(moduleOptions, row.modulo)}</span></td><td><strong>{row.titulo}</strong><small>{row.detalle || "Sin detalle adicional."}</small></td><td><StatusBadge value={row.operacion} label={labelFor(operationOptions, row.operacion)}/></td><td>{row.tienda || "Sin tienda"}</td><td>{row.realizado_por || "Sistema"}</td><td><div className="history-matrix__change"><span>{row.valor_anterior || "Sin registro"}</span><b>→</b><span>{row.valor_nuevo || "Sin registro"}</span></div></td></tr>)}</tbody></table></div>
      <Pagination page={page} pages={pages} onChange={setPage}/>
    </section> : <EmptyState icon={History} title="Sin movimientos" text="No hay movimientos que coincidan con los filtros seleccionados."/>}
  </>;
}
