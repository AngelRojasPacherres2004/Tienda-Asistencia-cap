import { useEffect, useMemo, useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { api, formatDate, todayISO } from "../lib/api";
import { EmptyState, Loading, Notice, PageHeader, Pagination, StatusBadge } from "../components/UI";

const kinds = [["todo", "Tráfico e incidencias"], ["trafico", "Tráfico por hora"], ["incidencias", "Robos e incidencias"], ["personal", "Personal de seguridad"]];
const monthStart = () => `${todayISO().slice(0, 7)}-01`;

export default function SecurityAdmin() {
  const [kind, setKind] = useState("todo");
  const [storeId, setStoreId] = useState("");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayISO);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [stores, setStores] = useState([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [exporting, setExporting] = useState(false);
  const query = useMemo(() => new URLSearchParams({ tipo: kind, desde: from, hasta: to, page: String(page), ...(storeId ? { tienda_id: storeId } : {}) }).toString(), [kind, storeId, from, to, page]);
  const validRange = kind === "personal" || /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)
    && to >= from && (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 <= 30;

  useEffect(() => {
    let active = true;
    if (!validRange) {
      setResult({ rows: [], total: 0 });
      setError("Selecciona un período válido de hasta 31 días.");
      return () => { active = false; };
    }
    setError("");
    setResult(null);
    api(`/seguridad-central?${query}`)
      .then(data => { if (active) { setResult(data); setStores(data.stores || []); } })
      .catch(reason => { if (active) { setResult({ rows: [], total: 0 }); setError(reason.message || "No se pudo cargar el reporte."); } });
    return () => { active = false; };
  }, [query, retry, validRange]);

  const update = (setter, value) => { setter(value); setPage(1); };
  const download = async () => {
    setExporting(true); setError("");
    try {
      const response = await fetch(`/api/seguridad-central?${query}&export=1`, { credentials: "include" });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "No se pudo generar el reporte.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = kind === "personal" ? "personal-seguridad.csv" : `seguridad-${kind}-${from}-${to}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (reason) { setError(reason.message || "No se pudo descargar el reporte."); }
    finally { setExporting(false); }
  };

  return <>
    <PageHeader eyebrow="Seguridad" title="Control de seguridad" />
    <div className="module-view-tabs" role="tablist" aria-label="Información de seguridad">
      {kinds.map(([id, label]) => <button type="button" key={id} role="tab" aria-selected={kind === id} className={kind === id ? "active" : ""} onClick={() => update(setKind, id)}>{label}</button>)}
    </div>
    {error && <Notice type="error" onClose={() => setError("")}>{error} <button type="button" className="button button--ghost button--small" onClick={() => setRetry(value => value + 1)}>Reintentar</button></Notice>}
    <section className="panel security-admin-panel">
      <div className="security-admin-filters">
        <label>Tienda<select value={storeId} onChange={event => update(setStoreId, event.target.value)}><option value="">Todas las tiendas</option>{stores.map(store => <option key={store.id} value={store.id}>{store.nombre}</option>)}</select></label>
        {kind !== "personal" && <><label>Desde<input type="date" value={from} max={to} onChange={event => update(setFrom, event.target.value)} /></label><label>Hasta<input type="date" value={to} min={from} max={todayISO()} onChange={event => update(setTo, event.target.value)} /></label></>}
        <button type="button" className="button button--soft" disabled={!result || !!error || exporting || !result.total} onClick={download}><Download size={16} />{exporting ? "Preparando…" : "Descargar CSV"}</button>
      </div>
      {!result ? <Loading /> : result.rows.length ? <>
        <div className="security-admin-table-wrap"><table className="security-admin-table"><thead><tr>{kind === "personal"
          ? <><th>Persona</th><th>Tienda</th><th>DNI</th><th>Cargo</th><th>Teléfono</th><th>Estado</th></>
          : <><th>Fecha</th><th>Tienda</th><th>Registro</th><th>Horario / tipo</th><th>Visitantes / unidades</th><th>Estado</th><th>Detalle</th></>}</tr></thead><tbody>
          {result.rows.map(row => kind === "personal" ? <tr key={row.id}><td>{row.nombres} {row.apellidos}</td><td>{row.tienda}</td><td>{row.dni}</td><td>{row.rol === "jefe_seguridad" ? "Jefe de seguridad" : "Seguridad"}</td><td>{row.telefono || "—"}</td><td><StatusBadge value={row.estado} /></td></tr>
            : <tr key={row.id}><td>{formatDate(row.fecha)}</td><td>{row.tienda}</td><td>{row.tipo_registro}</td><td>{row.rango_hora || [row.hora_evento, row.tipo_incidencia].filter(Boolean).join(" · ") || "—"}</td><td>{row.tipo_registro === "Tráfico" ? row.visitantes : row.unidades_afectadas || "—"}</td><td>{row.estado}</td><td>{row.descripcion || "—"}</td></tr>)}</tbody></table></div>
        <Pagination page={page} pages={Math.max(1, Math.ceil(result.total / 100))} onChange={setPage} />
      </> : <EmptyState icon={ShieldCheck} title="Sin registros" text="No hay datos para los filtros seleccionados." />}
    </section>
  </>;
}
