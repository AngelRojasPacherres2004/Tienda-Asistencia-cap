import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, Clock3, Mail, Pencil, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { ConfirmDialog, EmptyState, Field, Loading, Modal, Notice, PageHeader, Pagination, StatusBadge } from "../components/UI";
import AvisosAsistencia from "./AvisosAsistencia";
import "./attendance-notifications.css";

const emptySchedule = () => ({ nombre: "", asunto: "Reporte diario de asistencia", hora: "08:30", activo: true, tienda_id: "", destinatarios: "" });
const limaToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
};
const localDateTime = value => value ? new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Sin envíos";

export default function AjustesZonal() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [date, setDate] = useState(limaToday);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [formNotice, setFormNotice] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const id = ++requestId.current; setLoading(true);
    try { const result = await api(`/zonal/reportes-asistencia?pagina=${page}`); if (id === requestId.current) setData(result); }
    catch (error) { if (id === requestId.current) setNotice({ type: "error", text: error.message }); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [page]);
  useEffect(() => { load(); }, [load]);
  const start = schedule => {
    setFormNotice(null);
    setForm(schedule ? { ...schedule, hora: schedule.hora.slice(0, 5), tienda_id: schedule.tienda_id || "", destinatarios: schedule.destinatarios.join("\n") } : emptySchedule());
  };
  const save = async event => {
    event.preventDefault(); setBusy(true); setFormNotice(null);
    try {
      await api(`/zonal/reportes-asistencia${form.id ? `/${form.id}` : ""}`, { method: form.id ? "PUT" : "POST", body: { ...form, destinatarios: form.destinatarios.split(/[\s,;]+/).filter(Boolean) } });
      setForm(null); setNotice({ type: "success", text: "Programación guardada. Los horarios se interpretan en America/Lima." }); await load();
    } catch (error) { setFormNotice(error.message); } finally { setBusy(false); }
  };
  const send = async schedule => {
    setBusy(true); setNotice(null);
    try { await api(`/zonal/reportes-asistencia/${schedule.id}/enviar`, { method: "POST", body: { fecha: date } }); setNotice({ type: "success", text: `Reporte de ${date} enviado a los destinatarios de ${schedule.nombre}.` }); }
    catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { await load(); setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api(`/zonal/reportes-asistencia/${removing.id}`, { method: "DELETE" }); setRemoving(null); setNotice({ type: "success", text: "Programación eliminada. Se conserva su historial de envíos." }); await load(); }
    catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };
  const schedules = data?.programaciones || [];
  const active = schedules.filter(schedule => schedule.activo);
  const next = [...active].sort((a, b) => a.proximo_envio.localeCompare(b.proximo_envio))[0];
  const storeName = id => data?.tiendas.find(store => Number(store.id) === Number(id))?.nombre || "Tienda fuera del clúster activo";
  return <div className="attendance-report-settings">
    <PageHeader eyebrow="Mi cuenta" title="Ajustes" subtitle="Programaciones y notificaciones de asistencia" />
    <div className="attendance-settings-tab"><Mail size={18} />Asistencia</div>
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
    {!data ? loading ? <Loading /> : <button className="button button--ghost" onClick={load}><RefreshCw size={16} />Volver a cargar</button> : <>
      <section className="panel attendance-report-overview">
        <header className="attendance-report-heading"><div><span className="eyebrow">Reportes por correo</span><h2>Notificaciones de asistencia</h2></div><button className="button button--primary" disabled={busy} onClick={() => start()}><Plus size={17} />Nueva programación</button></header>
        <div className="attendance-report-banner"><span className="attendance-report-icon"><Mail size={24} /></span><div><strong>Envía automáticamente el reporte de asistencia</strong><p>Resumen, detalle del personal y archivo CSV. Todos los horarios usan America/Lima.</p></div><StatusBadge value={data.correo_configurado ? "activo" : "pendiente"} label={data.correo_configurado ? "Credenciales configuradas" : "Gmail pendiente"} /></div>
        <div className={`attendance-mail-status ${data.correo_configurado ? "is-ready" : ""}`}><CheckCircle2 size={18} /><span>{data.correo_configurado ? `Credenciales de Gmail configuradas para ${data.remitente}.` : `Configura la contraseña de aplicación de ${data.remitente} en el servidor para habilitar los envíos.`}</span></div>
        <div className="attendance-manual-date"><Field label="Fecha para envíos manuales" hint="Enviar ahora usa esta fecha y no modifica la programación."><input type="date" required value={date} max={limaToday()} disabled={busy} onChange={event => setDate(event.target.value)} /></Field><button className="button button--ghost" disabled={loading || busy} onClick={load}><RefreshCw size={16} />{loading ? "Actualizando…" : "Actualizar"}</button></div>
        <div className="attendance-report-metrics"><article><small>Programaciones</small><strong>{schedules.length}</strong></article><article><small>Activas</small><strong>{active.length}</strong></article><article><small>Próximo envío automático</small><strong className="attendance-next-run">{next ? localDateTime(next.proximo_envio) : "Sin programaciones activas"}</strong></article></div>
      </section>
      <section className="panel attendance-report-schedules"><header><span className="eyebrow">Envíos automáticos</span><h2>Programaciones</h2></header>
        {!schedules.length ? <EmptyState icon={CalendarClock} title="Sin programaciones" text="Crea una programación con su hora, alcance y destinatarios." /> : schedules.map(schedule => <article className="attendance-schedule-card" key={schedule.id}>
          <header><span className="attendance-report-icon"><Mail size={22} /></span><div><small>Programación #{schedule.id}</small><h3>{schedule.nombre}</h3></div><StatusBadge value={schedule.activo ? "activo" : "inactivo"} label={schedule.activo ? "Activa" : "Pausada"} /></header>
          <div className="attendance-schedule-time"><Clock3 size={19} /><strong>{schedule.hora.slice(0, 5)}</strong><small>Todos los días · America/Lima</small></div>
          <dl><div><dt>Asunto</dt><dd>{schedule.asunto}</dd></div><div><dt>Destinatarios</dt><dd>{schedule.destinatarios.join(", ")}</dd></div><div><dt>Alcance</dt><dd>{schedule.tienda_id ? storeName(schedule.tienda_id) : `Todas las tiendas activas de mi clúster (${data.tiendas.length})`}</dd></div><div><dt>Próximo envío</dt><dd>{schedule.activo ? localDateTime(schedule.proximo_envio) : "Programación pausada"}</dd></div></dl>
          <p className="attendance-last-send">Último envío: {localDateTime(schedule.ultimo_envio)}</p>
          <div className="attendance-schedule-actions"><button className="button button--primary" disabled={busy || !data.correo_configurado || !date} onClick={() => send(schedule)}><Send size={17} />{busy ? "Procesando…" : "Enviar ahora"}</button><button className="button button--ghost" disabled={busy} onClick={() => start(schedule)}><Pencil size={16} />Editar</button><button className="button button--danger" disabled={busy} onClick={() => setRemoving(schedule)}><Trash2 size={16} />Eliminar</button></div>
        </article>)}
      </section>
      <section className="panel attendance-report-history"><header><span className="eyebrow">Seguimiento</span><h2>Historial de envíos</h2></header>
        <p>“Sin registro” no equivale a una falta. Asistentes incluye tardanzas, medio turno y apoyos.</p>
        {!data.historial.length ? <EmptyState title="Sin envíos todavía" text="Aquí aparecerán los envíos manuales y automáticos, incluidos los errores." /> : <div className="attendance-history-scroll"><table><thead><tr>{["Programación", "Fecha", "Envío", "Estado", "Destinatarios", "Asistentes", "Faltas", "Sin registro", "Intentos", "Fecha de envío", "Detalle"].map(title => <th key={title}>{title}</th>)}</tr></thead><tbody>{data.historial.map(entry => <tr key={entry.id}><td>{entry.nombre}</td><td>{entry.fecha}</td><td>{entry.tipo === "automatico" ? "Automático" : "Manual"}</td><td><StatusBadge value={entry.estado} /></td><td>{entry.destinatarios.join(", ")}</td><td>{entry.asistentes}</td><td>{entry.faltas}</td><td>{entry.sin_registro}</td><td>{entry.intentos}</td><td>{localDateTime(entry.enviado_at || entry.created_at)}</td><td>{entry.detalle || "—"}</td></tr>)}</tbody></table></div>}
        <div className="attendance-history-footer"><small>{data.total_historial} registros</small><Pagination page={page} pages={Math.max(1, Math.ceil(data.total_historial / 20))} onChange={setPage} /></div>
      </section>
      <details className="panel attendance-instant-settings"><summary>Avisos inmediatos al guardar asistencias (opcional)</summary><AvisosAsistencia /></details>
    </>}
    <Modal open={Boolean(form)} title={form?.id ? "Editar programación" : "Nueva programación"} subtitle="Reporte diario de asistencia · America/Lima" wide onClose={() => { if (!busy) setForm(null); }}>
      {form && <form onSubmit={save}>
        {formNotice && <Notice type="error">{formNotice}</Notice>}
        <div className="attendance-schedule-form"><Field label="Nombre *"><input required minLength={2} maxLength={100} value={form.nombre} disabled={busy} onChange={event => setForm({ ...form, nombre: event.target.value })} /></Field><Field label="Hora diaria (Lima) *"><input type="time" required value={form.hora} disabled={busy} onChange={event => setForm({ ...form, hora: event.target.value })} /></Field><Field label="Asunto del correo *"><input required minLength={2} maxLength={150} value={form.asunto} disabled={busy} onChange={event => setForm({ ...form, asunto: event.target.value })} /></Field><Field label="Alcance"><select value={form.tienda_id} disabled={busy} onChange={event => setForm({ ...form, tienda_id: event.target.value })}><option value="">Todas las tiendas activas de mi clúster</option>{data?.tiendas.map(store => <option key={store.id} value={store.id}>{store.nombre}</option>)}</select></Field><Field label="Destinatarios *" hint="Hasta 20 correos, separados por comas o un correo por línea."><textarea rows={4} required value={form.destinatarios} disabled={busy} onChange={event => setForm({ ...form, destinatarios: event.target.value })} /></Field><label className="check-line"><input type="checkbox" checked={form.activo} disabled={busy} onChange={event => setForm({ ...form, activo: event.target.checked })} />Programación activa</label></div>
        <p className="form-hint">Se enviará a la próxima hora elegida. Para un reporte inmediato usa Enviar ahora. Incluye al personal actualmente activo incorporado hasta la fecha consultada.</p>
        <div className="form-actions"><button type="button" className="button button--ghost" disabled={busy} onClick={() => setForm(null)}>Cancelar</button><button className="button button--primary" disabled={busy}>{busy ? "Guardando…" : "Guardar programación"}</button></div>
      </form>}
    </Modal>
    <ConfirmDialog open={Boolean(removing)} title="Eliminar programación" message={`¿Eliminar ${removing?.nombre}? Se conservará el historial de envíos.`} busy={busy} onConfirm={remove} onClose={() => { if (!busy) setRemoving(null); }} />
  </div>;
}
