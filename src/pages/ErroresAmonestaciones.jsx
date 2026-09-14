import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ShieldAlert, Trash2 } from "lucide-react";
import { api, formatDateTime, todayISO } from "../lib/api";
import { ConfirmDialog, EmptyState, Field, Loading, Notice, PageHeader, SuccessDialog } from "../components/UI";

const blank = { usuario_id: "", tipo_documento: "", descripcion: "", fecha: todayISO() };
const documentLabels = { carta_amonestacion: "Carta de amonestación", memorandum: "Memorándum", verbal: "Verbal" };
const roleLabels = { jefe_zonal: "Jefe zonal", administrador_tienda: "Administrador de tienda", jefe_tienda: "Jefe de tienda", empleado: "Empleado", vendedor: "Vendedor", seguridad: "Seguridad" };

export default function ErroresAmonestaciones({ user }) {
  const isMainAdmin = user?.rol_db === "admin";
  const isStoreAdmin = user?.rol_db === "administrador_tienda";
  const [section, setSection] = useState(isStoreAdmin ? "amonestaciones" : "errores");
  const [mode, setMode] = useState("registrar");
  const [errores, setErrores] = useState(null);
  const [amonestaciones, setAmonestaciones] = useState(null);
  const [personal, setPersonal] = useState([]);
  const [form, setForm] = useState({ ...blank });
  const [selectedId, setSelectedId] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(null);

  const load = useCallback(() => Promise.all([isStoreAdmin ? Promise.resolve([]) : api("/incidentes"), api("/amonestaciones"), api("/usuarios")])
    .then(([incidentRows, warningRows, users]) => { setErrores(incidentRows); setAmonestaciones(warningRows); setPersonal(users.filter((person) => person.rol === (isMainAdmin ? "jefe_zonal" : "administrador_tienda"))); })
    .catch((error) => setNotice({ type: "error", text: error.message })), [isMainAdmin, isStoreAdmin]);
  useEffect(() => { load(); }, [load]);
  const scopedPersonal = useMemo(() => personal.filter((person) => isStoreAdmin ? ["empleado", "vendedor", "seguridad", "jefe_tienda"].includes(person.rol) : person.rol === (isMainAdmin ? "jefe_zonal" : "administrador_tienda")), [personal, isMainAdmin, isStoreAdmin]);
  const summary = useMemo(() => scopedPersonal.map((person) => ({ ...person, cantidad: (amonestaciones || []).filter((item) => Number(item.usuario_id) === Number(person.id)).length })), [scopedPersonal, amonestaciones]);

  const save = async (event) => {
    event.preventDefault(); setBusy(true); setNotice(null);
    try { await api("/amonestaciones", { method: "POST", body: form }); setForm({ ...blank }); await load(); setSuccess({ title: "Amonestación registrada", message: "La amonestación se guardó correctamente." }); }
    catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!deleting) return; setBusy(true); setNotice(null);
    try { await api(`/amonestaciones/${deleting.id}`, { method: "DELETE" }); setDeleting(null); setSelectedId(""); await load(); setSuccess({ title: "Amonestación eliminada", message: "El registro fue eliminado correctamente." }); }
    catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { setBusy(false); }
  };

  return <>
    <PageHeader eyebrow={isStoreAdmin ? "Mi tienda" : "Gestión zonal"} title={isStoreAdmin ? "Amonestaciones" : "Errores y amonestaciones"} subtitle={isStoreAdmin ? "Registra y consulta las amonestaciones del personal de tu tienda." : "Consulta los errores reportados y administra las amonestaciones de los responsables de tienda."} />
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
    {!isStoreAdmin && <nav className="schedule-tabs"><button className={section === "errores" ? "active" : ""} onClick={() => setSection("errores")}><ShieldAlert size={16} />Errores</button><button className={section === "amonestaciones" ? "active" : ""} onClick={() => setSection("amonestaciones")}><AlertTriangle size={16} />Amonestaciones</button></nav>}
    {section === "errores" ? (!errores ? <Loading /> : errores.length ? <div className="incident-list">{errores.map((item) => <article className="incident-card" key={item.id}><span className="incident-card__icon"><ShieldAlert size={20} /></span><div><header><h3>{item.titulo}</h3><time>{formatDateTime(item.fecha_creacion)}</time></header><p>{item.descripcion}</p><small>Reportado por {item.reportado_por_nombre || "Seguridad"}</small></div></article>)}</div> : <EmptyState icon={ShieldAlert} title="Sin errores" text="No hay errores reportados." />) : <>
      <section className="panel warning-summary"><header className="panel__header"><div><small>Resumen</small><h2>Amonestaciones por usuario</h2></div></header>{!amonestaciones ? <Loading /> : <div className="table-panel"><div className="data-table data-table--warning-summary"><div className="data-table__head"><span>Trabajador</span><span>Usuario</span><span>Rol</span><span>Amonestaciones</span></div>{summary.map((item) => <div className="data-table__row" key={item.id}><strong>{item.nombres} {item.apellidos}</strong><span>@{item.usuario}</span><span>{roleLabels[item.rol] || item.rol}</span><strong>{item.cantidad}</strong></div>)}</div></div>}</section>
      <section className="panel warning-form-panel"><nav className="warning-mode-tabs"><button className={mode === "registrar" ? "active" : ""} onClick={() => setMode("registrar")}>Registrar</button><button className={mode === "eliminar" ? "active" : ""} onClick={() => setMode("eliminar")}>Eliminar</button></nav>
        {mode === "registrar" ? <form className="form-grid" onSubmit={save}><Field label="Usuario"><select required value={form.usuario_id} onChange={(e) => setForm({ ...form, usuario_id: e.target.value })}><option value="">Selecciona un usuario activo</option>{personal.filter((item) => item.estado === "activo").map((item) => <option key={item.id} value={item.id}>{item.nombres} {item.apellidos} · {item.tienda_nombre || "Sin tienda"}</option>)}</select></Field><Field label="Tipo de documento"><select required value={form.tipo_documento} onChange={(e) => setForm({ ...form, tipo_documento: e.target.value })}><option value="">Selecciona el documento</option><option value="carta_amonestacion">CARTA AMONESTACIÓN</option><option value="memorandum">MEMORÁNDUM</option><option value="verbal">VERBAL</option></select></Field><Field label="Fecha" hint="Puede ser hoy o una fecha anterior."><input required type="date" max={todayISO()} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></Field><Field label="Descripción" className="span-2"><textarea required minLength={5} maxLength={3000} rows={5} placeholder="Detalla el motivo de la amonestación" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></Field><div className="span-2"><button className="button button--primary" disabled={busy}><AlertTriangle size={16} />{busy ? "Registrando…" : "Registrar amonestación"}</button></div></form>
          : <div className="warning-delete"><Field label="Amonestación"><select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}><option value="">Selecciona el registro que deseas eliminar</option>{(amonestaciones || []).map((item) => <option key={item.id} value={item.id}>{item.fecha} · {item.usuario_nombre} · {documentLabels[item.tipo_documento]}</option>)}</select></Field><button className="button button--danger" disabled={!selectedId} onClick={() => setDeleting((amonestaciones || []).find((item) => String(item.id) === selectedId))}><Trash2 size={16} />Eliminar amonestación</button></div>}
      </section>
      <section className="panel warning-history"><header className="panel__header"><div><small>Detalle</small><h2>Historial de amonestaciones</h2></div></header>{!amonestaciones ? <Loading /> : amonestaciones.length ? <div className="table-panel"><div className="data-table data-table--warning-history"><div className="data-table__head"><span>Fecha</span><span>Trabajador</span><span>Tipo de documento</span><span>Descripción</span><span>Encargado</span></div>{amonestaciones.map((item) => <div className="data-table__row" key={item.id}><span>{item.fecha}</span><strong>{item.usuario_nombre}</strong><span>{documentLabels[item.tipo_documento]}</span><span>{item.descripcion}</span><span>{item.creado_por_nombre}</span></div>)}</div></div> : <EmptyState icon={AlertTriangle} title="Sin amonestaciones" text="Todavía no se han registrado amonestaciones." />}</section>
    </>}
    <ConfirmDialog open={!!deleting} title="Eliminar amonestación" message={`¿Seguro que quieres eliminar la amonestación de ${deleting?.usuario_nombre || "este usuario"}?`} busy={busy} onConfirm={remove} onClose={() => setDeleting(null)} />
    <SuccessDialog open={!!success} title={success?.title} message={success?.message} onContinue={() => setSuccess(null)} />
  </>;
}
