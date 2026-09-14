import { useEffect, useState } from "react";
import { Plus, ShieldAlert } from "lucide-react";
import { api, formatDateTime } from "../lib/api";
import { EmptyState, Field, Loading, Modal, Notice, PageHeader, SuccessDialog } from "../components/UI";

const blank = { titulo: "", descripcion: "" };

export default function Incidentes() {
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(false);

  const load = () => api("/incidentes").then(setItems).catch((error) => setNotice({ type: "error", text: error.message }));
  useEffect(() => { load(); }, []);

  const save = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (editing.titulo.trim().length < 3) nextErrors.titulo = "Ingresa un título de al menos 3 caracteres.";
    if (editing.descripcion.trim().length < 5) nextErrors.descripcion = "Describe el incidente con al menos 5 caracteres.";
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    setBusy(true); setNotice(null);
    try {
      await api("/incidentes", { method: "POST", body: editing });
      setEditing(null);
      await load();
      setSuccess(true);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Seguridad"
        title="Incidencias"
        subtitle="Registra y consulta los incidentes ocurridos en la operación."
        action={<button className="button button--primary" onClick={() => { setErrors({}); setEditing({ ...blank }); }}><Plus size={16} />Nuevo incidente</button>}
      />
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      {!items ? <Loading label="Cargando incidentes…" /> : items.length ? (
        <div className="incident-list">
          {items.map((item) => (
            <article className="incident-card" key={item.id}>
              <span className="incident-card__icon"><ShieldAlert size={20} /></span>
              <div>
                <header><h3>{item.titulo}</h3><time>{formatDateTime(item.fecha_creacion)}</time></header>
                <p>{item.descripcion}</p>
                <small>Registrado por {item.reportado_por_nombre || "Seguridad"}</small>
              </div>
            </article>
          ))}
        </div>
      ) : <EmptyState icon={ShieldAlert} title="Sin incidentes" text="Todavía no se ha registrado ningún incidente." />}

      <Modal open={!!editing} title="Registrar incidente" subtitle="Describe claramente lo ocurrido." onClose={() => setEditing(null)}>
        {editing && <form className="form-grid" onSubmit={save} noValidate>
          <Field label="Título" error={errors.titulo} className="span-2">
            <input required maxLength={150} value={editing.titulo} onChange={(event) => { setEditing({ ...editing, titulo: event.target.value }); setErrors({ ...errors, titulo: "" }); }} />
          </Field>
          <Field label="Descripción" error={errors.descripcion} className="span-2">
            <textarea required rows={7} maxLength={3000} value={editing.descripcion} onChange={(event) => { setEditing({ ...editing, descripcion: event.target.value }); setErrors({ ...errors, descripcion: "" }); }} />
          </Field>
          <div className="form-actions span-2">
            <button type="button" className="button button--ghost" onClick={() => setEditing(null)}>Cancelar</button>
            <button className="button button--primary" disabled={busy}>{busy ? "Registrando…" : "Registrar incidente"}</button>
          </div>
        </form>}
      </Modal>
      <SuccessDialog open={success} title="Incidente registrado" message="El incidente se guardó correctamente." onContinue={() => setSuccess(false)} />
    </>
  );
}
