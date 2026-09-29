import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Loading, Notice, PageHeader } from "../components/UI";

export default function AvisosAsistencia() {
  const [form, setForm] = useState(null);
  const [emails, setEmails] = useState("");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("/zonal/notificaciones").then(result => { setForm(result); setEmails(result.destinatarios.join("\n")); }).catch(error => setNotice({ type: "error", text: error.message })); }, []);
  const save = async event => {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      const result = await api("/zonal/notificaciones", { method: "PUT", body: { activo: form.activo, registros: form.registros, faltas: form.faltas, tardanzas: form.tardanzas, destinatarios: emails.split(/[\s,;]+/).filter(Boolean) } });
      setForm(result); setEmails(result.destinatarios.join("\n")); setNotice({ type: "success", text: "Configuración guardada." });
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setNotice(null);
    try { await api("/zonal/notificaciones/prueba", { method: "POST" }); setNotice({ type: "success", text: "Correo de prueba enviado a los destinatarios guardados." }); }
    catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };
  return <><PageHeader title="Avisos al guardar asistencia" subtitle="Opcional: avisos inmediatos, independientes de los reportes programados" />
    {notice && <Notice type={notice.type}>{notice.text}</Notice>}
    {!form ? !notice && <Loading /> : <form className="panel zonal-notification-settings" onSubmit={save}>
      <h2>Notificaciones de asistencia</h2>
      <p>Remitente: {form.remitente}. Los avisos se envían al guardar asistencias nuevas o modificadas. Guardar sin cambios no genera otro aviso.</p>
      {!form.correo_configurado && <Notice type="error">El correo de envío todavía no está configurado. Puedes guardar tus preferencias; el administrador debe habilitar Gmail en el servidor.</Notice>}
      {[['activo', 'Activar notificaciones'], ['registros', 'Todos los registros y modificaciones'], ['faltas', 'Faltas'], ['tardanzas', 'Tardanzas']].map(([key, label]) => <label className="check-line" key={key}><input type="checkbox" checked={form[key]} disabled={busy} onChange={event => setForm({ ...form, [key]: event.target.checked })} />{label}</label>)}
      <label className="field"><span>Correos destinatarios (máximo 20)</span><textarea rows={5} value={emails} disabled={busy} onChange={event => setEmails(event.target.value)} placeholder="correo1@gmail.com&#10;correo2@empresa.com" /><small>Un correo por línea, o separados por comas. Cada zonal configura sus propios destinatarios.</small></label>
      <div className="form-actions"><button className="button button--primary" disabled={busy}>{busy ? "Procesando…" : "Guardar ajustes"}</button><button type="button" className="button button--ghost" disabled={busy || !form.correo_configurado || !form.destinatarios.length} onClick={test}>Enviar prueba a correos guardados</button></div>
    </form>}
  </>;
}
