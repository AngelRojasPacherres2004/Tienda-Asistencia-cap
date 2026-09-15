import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileClock, Gavel, Gauge } from "lucide-react";
import { api, formatDate, todayISO } from "../lib/api";
import { EmptyState, Field, Loading, Notice, PageHeader } from "../components/UI";

const central = new Set(["gerencia_general", "gerente_comercial", "coach", "jefe_zonal"]);

export default function GestionTienda({ user }) {
  const [storeId, setStoreId] = useState(user.tienda_id || "");
  const [stores, setStores] = useState([]);
  const [data, setData] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [notice, setNotice] = useState(null);
  const [kind, setKind] = useState("error");
  const [form, setForm] = useState({ usuario_id: "", fecha: todayISO(), categoria: "", descripcion: "", accion_correctiva: "", tipo: "verbal", motivo: "", nombre: "", numero: "", entidad_emisora: "", fecha_emision: "", fecha_vencimiento: "", notas: "" });
  const canWarn = ["jefe_tienda", "jefe_zonal"].includes(user.rol);
  const canDocument = user.rol === "jefe_tienda";
  const canError = ["jefe_tienda", "asistente_tienda", "jefe_zonal"].includes(user.rol);

  useEffect(() => { if (central.has(user.rol)) api("/tiendas").then((rows) => { setStores(rows); if (rows[0]) setStoreId(String(rows[0].id)); }).catch((err) => setNotice({ type: "error", text: err.message })); }, [user.rol]);
  const load = useCallback(() => {
    if (!storeId) return;
    const query = `?tienda_id=${storeId}`;
    Promise.all([api(`/operaciones/resumen${query}`), api(`/errores-personal${query}`).catch(() => []), api(`/amonestaciones${query}`).catch(() => []), api(`/documentos-tienda${query}`).catch(() => [])])
      .then(([summary, errors, warnings, documents]) => setData({ summary, errors, warnings, documents })).catch((err) => setNotice({ type: "error", text: err.message }));
    if (!central.has(user.rol) || user.rol === "jefe_zonal") api("/usuarios").then(setWorkers).catch(() => setWorkers([]));
  }, [storeId, user.rol]);
  useEffect(load, [load]);

  const submit = async (event) => {
    event.preventDefault(); setNotice(null);
    try {
      const body = { ...form, tienda_id: Number(storeId) || undefined };
      if (kind === "error") await api("/errores-personal", { method: "POST", body });
      if (kind === "warning") await api("/amonestaciones", { method: "POST", body });
      if (kind === "document") await api("/documentos-tienda", { method: "POST", body });
      setForm({ ...form, categoria: "", descripcion: "", accion_correctiva: "", motivo: "", nombre: "", numero: "", entidad_emisora: "", fecha_emision: "", fecha_vencimiento: "", notas: "" }); load();
    } catch (err) { setNotice({ type: "error", text: err.message }); }
  };

  return <>
    <PageHeader eyebrow="Operaciones" title={user.rol === "jefe_zonal" ? "Control de administradores" : "Gestión de tienda"} subtitle={user.rol === "jefe_zonal" ? "Errores y amonestaciones de los administradores de tu clúster." : "Resumen de incidencias, amonestaciones, errores y vencimientos documentarios."} action={central.has(user.rol) && <select value={storeId} onChange={(e) => setStoreId(e.target.value)}><option value="">Selecciona tienda</option>{stores.map((s) => <option value={s.id} key={s.id}>{s.nombre}</option>)}</select>} />
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
    {!data ? <Loading /> : <>
      <div className="metrics-grid ops-metrics">{Object.entries(data.summary).map(([key, value]) => <article className="metric-card" key={key}><span><Gauge size={18} /></span><div><small>{key.replaceAll("_", " ")}</small><strong>{value}</strong></div></article>)}</div>
      {(canError || canWarn || canDocument) && <form className="panel ops-form" onSubmit={submit}>
        <div className="segmented">
          {canError && <button type="button" className={kind === "error" ? "active" : ""} onClick={() => setKind("error")}>Error de personal</button>}
          {canWarn && <button type="button" className={kind === "warning" ? "active" : ""} onClick={() => setKind("warning")}>Amonestación</button>}
          {canDocument && <button type="button" className={kind === "document" ? "active" : ""} onClick={() => setKind("document")}>Documento</button>}
        </div>
        {kind !== "document" && <><Field label="Persona"><select required value={form.usuario_id} onChange={(e) => setForm({ ...form, usuario_id: e.target.value })}><option value="">Selecciona</option>{workers.filter((w) => user.rol !== "jefe_zonal" || String(w.tienda_id) === String(storeId)).map((w) => <option value={w.id} key={w.id}>{w.nombres} {w.apellidos} · {w.rol}</option>)}</select></Field><Field label="Fecha"><input required type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></Field></>}
        {kind === "error" && <><Field label="Categoría"><input required value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} /></Field><Field label="Descripción"><textarea required value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></Field><Field label="Acción correctiva"><textarea value={form.accion_correctiva} onChange={(e) => setForm({ ...form, accion_correctiva: e.target.value })} /></Field></>}
        {kind === "warning" && <><Field label="Tipo"><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}><option value="verbal">Verbal</option><option value="carta_amonestacion">Carta de amonestación</option><option value="memorandum">Memorándum</option></select></Field><Field label="Motivo"><textarea required value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} /></Field></>}
        {kind === "document" && <><Field label="Documento"><input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field><Field label="Número"><input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></Field><Field label="Entidad emisora"><input value={form.entidad_emisora} onChange={(e) => setForm({ ...form, entidad_emisora: e.target.value })} /></Field><Field label="Emisión"><input type="date" value={form.fecha_emision} onChange={(e) => setForm({ ...form, fecha_emision: e.target.value })} /></Field><Field label="Vencimiento"><input required type="date" value={form.fecha_vencimiento} onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} /></Field><Field label="Notas"><textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></Field></>}
        <button className="button button--primary">Guardar registro</button>
      </form>}
      <div className="ops-grid ops-grid--three">
        <OpsList icon={AlertTriangle} title="Errores" rows={data.errors} render={(r) => <><strong>{r.categoria}</strong><span>{r.usuarios?.nombres} {r.usuarios?.apellidos} · {formatDate(r.fecha)}</span><small>{r.descripcion}</small></>} />
        <OpsList icon={Gavel} title="Amonestaciones" rows={data.warnings} render={(r) => <><strong>{r.tipo.replaceAll("_", " ")}</strong><span>{r.usuarios?.nombres} {r.usuarios?.apellidos} · {formatDate(r.fecha)}</span><small>{r.motivo}</small></>} />
        {user.rol !== "jefe_zonal" && <OpsList icon={FileClock} title="Documentos" rows={data.documents} render={(r) => <><strong>{r.nombre}</strong><span>Vence {formatDate(r.fecha_vencimiento)}</span><small>{r.numero || r.entidad_emisora || "Sin datos adicionales"}</small></>} />}
      </div>
    </>}
  </>;
}

function OpsList({ icon, title, rows, render }) {
  return <section className="panel"><header className="panel__header"><h2>{title}</h2></header>{rows.length ? rows.map((row) => <div className="ops-row" key={row.id}>{render(row)}</div>) : <EmptyState icon={icon} title={`Sin ${title.toLowerCase()}`} text="No existen registros para esta tienda." />}</section>;
}
