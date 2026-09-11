import { useEffect, useMemo, useState } from "react";
import { Bell, Edit3, Mail, Pause, Play, Plus, Send, Trash2 } from "lucide-react";
import { api, todayISO } from "../lib/api";
import { ConfirmDialog, EmptyState, Field, Loading, Modal, Notice, PageHeader, StatusBadge } from "../components/UI";

const blank = { nombre: "Reporte diario", hora: "18:00", asunto: "Reporte de asistencia · {fecha}", destinatarios_texto: "", alcance: "todos", usuario_ids: [], activo: true };
const stateLabels = { procesando: "Procesando", enviado: "Enviado", error: "Error", requiere_revision: "Requiere revisión" };

export default function NotificacionesAsistencia({ user }) {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [sending, setSending] = useState(null);
  const [sendDate, setSendDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const load = () => api("/notificaciones/asistencia").then(setData).catch((error) => setNotice({ type: "error", text: error.message }));
  useEffect(() => { load(); }, []);
  const schedulesById = useMemo(() => new Map((data?.programaciones || []).map((item) => [item.id, item.nombre])), [data]);
  if (user.rol_db !== "gerente") return <Notice type="error">Solo el gerente puede acceder a esta sección.</Notice>;

  const openEdit = (item = blank) => setEditing({ ...item, destinatarios_texto: (item.destinatarios || []).join("\n"), usuario_ids: item.usuario_ids || [] });
  const payload = (item) => ({ ...item, destinatarios: item.destinatarios_texto.split(/[\n,;]+/).map((email) => email.trim()).filter(Boolean) });
  const save = async (event) => { event.preventDefault(); setBusy(true); setNotice(null); try { await api(editing.id ? `/notificaciones/asistencia/${editing.id}` : "/notificaciones/asistencia", { method: editing.id ? "PUT" : "POST", body: payload(editing) }); setEditing(null); await load(); setNotice({ type: "success", text: "Programación guardada." }); } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); } };
  const toggle = async (item) => { setBusy(true); try { await api(`/notificaciones/asistencia/${item.id}`, { method: "PUT", body: payload({ ...item, destinatarios_texto: item.destinatarios.join("\n"), activo: !item.activo }) }); await load(); } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); } };
  const remove = async () => { setBusy(true); try { await api(`/notificaciones/asistencia/${deleting.id}`, { method: "DELETE" }); setDeleting(null); await load(); } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); } };
  const sendNow = async (event) => { event.preventDefault(); setBusy(true); try { const result = await api(`/notificaciones/asistencia/${sending.id}/enviar`, { method: "POST", body: { fecha: sendDate } }); setSending(null); await load(); setNotice({ type: "success", text: `Correo enviado: ${result.asistentes} asistieron y ${result.ausentes} no asistieron.` }); } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); } };

  if (!data) return <Loading />;
  return <>
    <PageHeader eyebrow="Notificaciones · Asistencia" title="Reportes diarios por correo" subtitle="Programa y controla el envío automático de asistencia." action={<button className="button button--primary" onClick={() => openEdit()}><Plus size={16} />Nueva programación</button>} />
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
    <div className="notification-grid">
      {data.programaciones.length ? data.programaciones.map((item) => <article className="notification-card" key={item.id}>
        <header><span><Bell size={19} /></span><div><h3>{item.nombre}</h3><small>Todos los días a las {String(item.hora).slice(0, 5)}</small></div><StatusBadge value={item.activo ? "activo" : "pausado"} label={item.activo ? "Activa" : "Pausada"} /></header>
        <p><Mail size={14} />{item.asunto}</p><small>{item.destinatarios.length} destinatario(s) · {item.alcance === "todos" ? "Todos los trabajadores activos" : `${item.usuario_ids.length} seleccionados`}</small>
        <footer><button onClick={() => toggle(item)} disabled={busy}>{item.activo ? <Pause size={14} /> : <Play size={14} />}{item.activo ? "Pausar" : "Activar"}</button><button onClick={() => openEdit(item)}><Edit3 size={14} />Editar</button><button onClick={() => setSending(item)}><Send size={14} />Enviar ahora</button><button className="danger" onClick={() => setDeleting(item)}><Trash2 size={14} /></button></footer>
      </article>) : <EmptyState icon={Bell} title="Sin programaciones" text="Crea la primera programación de asistencia." />}
    </div>
    <section className="notification-history"><h2>Últimos envíos</h2>{data.envios.length ? <div className="table-panel"><div className="data-table data-table--notification-history"><div className="data-table__head"><span>Programación</span><span>Fecha</span><span>Tipo</span><span>Destinatarios</span><span>Resultado</span><span>Intentos</span><span>Estado</span></div>{data.envios.map((item) => <div className="data-table__row" key={item.id}><strong className="cell-primary">{schedulesById.get(item.programacion_id) || "Programación eliminada"}</strong><span>{item.fecha_reporte}</span><span>{item.tipo}</span><span>{item.destinatarios.length}</span><span>{item.asistentes} / {item.ausentes}</span><span>{item.intentos}</span><div><StatusBadge value={item.estado} label={stateLabels[item.estado]} />{item.error && <small title={item.error}>{item.error}</small>}</div></div>)}</div></div> : <EmptyState icon={Send} title="Sin envíos" text="El historial aparecerá después del primer envío." />}</section>

    <Modal open={!!editing} wide title={editing?.id ? "Editar programación" : "Nueva programación"} onClose={() => setEditing(null)}>{editing && <form className="form-grid" onSubmit={save}>
      <Field label="Nombre"><input required maxLength={120} value={editing.nombre} onChange={(e) => setEditing({ ...editing, nombre: e.target.value })} /></Field><Field label="Hora diaria"><input required type="time" value={String(editing.hora).slice(0, 5)} onChange={(e) => setEditing({ ...editing, hora: e.target.value })} /></Field>
      <Field label="Asunto" hint="Puedes usar {fecha}." className="span-2"><input required maxLength={200} value={editing.asunto} onChange={(e) => setEditing({ ...editing, asunto: e.target.value })} /></Field>
      <Field label="Destinatarios" hint="Uno por línea, máximo 20." className="span-2"><textarea required rows={4} value={editing.destinatarios_texto} onChange={(e) => setEditing({ ...editing, destinatarios_texto: e.target.value })} /></Field>
      <Field label="Alcance"><select value={editing.alcance} onChange={(e) => setEditing({ ...editing, alcance: e.target.value, usuario_ids: [] })}><option value="todos">Todos los trabajadores activos</option><option value="especificos">Selección específica</option></select></Field><Field label="Envío automático"><select value={editing.activo ? "1" : "0"} onChange={(e) => setEditing({ ...editing, activo: e.target.value === "1" })}><option value="1">Activo</option><option value="0">Pausado</option></select></Field>
      {editing.alcance === "especificos" && <div className="worker-notification-picker span-2">{data.trabajadores.map((worker) => <label key={worker.id}><input type="checkbox" checked={editing.usuario_ids.includes(worker.id)} onChange={(e) => setEditing({ ...editing, usuario_ids: e.target.checked ? [...editing.usuario_ids, worker.id] : editing.usuario_ids.filter((id) => id !== worker.id) })} /><span>{worker.nombres} {worker.apellidos}<small>{worker.tienda_nombre} · {worker.rol}</small></span></label>)}</div>}
      <div className="form-actions span-2"><button type="button" className="button button--ghost" onClick={() => setEditing(null)}>Cancelar</button><button className="button button--primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button></div>
    </form>}</Modal>
    <Modal open={!!sending} title="Enviar reporte ahora" subtitle="Este envío no consume el automático del día." onClose={() => setSending(null)}>{sending && <form className="form-grid" onSubmit={sendNow}><Field label="Fecha del reporte" className="span-2"><input required type="date" max={todayISO()} value={sendDate} onChange={(e) => setSendDate(e.target.value)} /></Field><div className="form-actions span-2"><button type="button" className="button button--ghost" onClick={() => setSending(null)}>Cancelar</button><button className="button button--primary" disabled={busy}>{busy ? "Enviando…" : "Enviar correo"}</button></div></form>}</Modal>
    <ConfirmDialog open={!!deleting} title="Eliminar programación" message="Se eliminará la programación, pero se conservará todo su historial de envíos." onClose={() => setDeleting(null)} onConfirm={remove} busy={busy} />
  </>;
}
