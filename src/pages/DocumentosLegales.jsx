import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, Plus, Upload } from "lucide-react";
import { api, formatDate, todayISO } from "../lib/api";
import { EmptyState, Field, Loading, Modal, Notice, PageHeader, StatusBadge } from "../components/UI";

const blank = { documento: "", referencia: "", fecha_emision: todayISO(), fecha_vencimiento: "", archivo: null };
const estados = {
  vigente: "Vigente",
  por_vencer: "Por vencer",
  vencido: "Vencido",
  sin_vencimiento: "Sin vencimiento",
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

export default function DocumentosLegales({ user, embedded = false }) {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [estado, setEstado] = useState("todos");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [errors, setErrors] = useState({});

  const load = () => api("/documentos-legales").then(setData).catch((error) => setNotice({ type: "error", text: error.message }));
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    const items = data?.documentos || [];
    return estado === "todos" ? items : items.filter((item) => item.estado === estado);
  }, [data, estado]);

  const save = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (editing.documento.trim().length < 3) nextErrors.documento = "Ingresa el nombre del documento.";
    if (editing.referencia.trim().length < 2) nextErrors.referencia = "Ingresa el número o referencia.";
    if (!editing.fecha_emision) nextErrors.fecha_emision = "Selecciona la fecha de emisión.";
    if (editing.fecha_vencimiento && editing.fecha_vencimiento < editing.fecha_emision) nextErrors.fecha_vencimiento = "Debe ser posterior a la emisión.";
    if (!editing.archivo) nextErrors.archivo = "Selecciona un PDF.";
    else if (editing.archivo.type !== "application/pdf" && !editing.archivo.name.toLowerCase().endsWith(".pdf")) nextErrors.archivo = "Solo se permiten archivos PDF.";
    else if (editing.archivo.size > 4 * 1024 * 1024) nextErrors.archivo = "El PDF no puede superar los 4 MB.";
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    setBusy(true); setNotice(null);
    try {
      const archivoBase64 = await fileToBase64(editing.archivo);
      await api("/documentos-legales", {
        method: "POST",
        body: {
          documento: editing.documento,
          referencia: editing.referencia,
          fecha_emision: editing.fecha_emision,
          fecha_vencimiento: editing.fecha_vencimiento || null,
          archivo_nombre: editing.archivo.name,
          archivo_base64: archivoBase64,
        },
      });
      setEditing(null);
      await load();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally { setBusy(false); }
  };

  const openFile = async (id) => {
    setNotice(null);
    try {
      const { url } = await api(`/documentos-legales/${id}/archivo`);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) { setNotice({ type: "error", text: error.message }); }
  };

  if (user.rol_db !== "administrador_tienda") return <Notice type="error">No tienes permisos para acceder a esta sección.</Notice>;

  return (
    <>
      {!embedded && <PageHeader
        eyebrow="Documentos"
        title="Documentos legales de tienda"
        subtitle="Sube y controla las licencias, certificados y permisos de tu tienda."
        action={<button className="button button--primary" onClick={() => { setErrors({}); setEditing({ ...blank }); }}><Plus size={16} />Subir documento</button>}
      />}
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      {!data ? <Loading label="Cargando documentos legales…" /> : <>
        <div className="legal-docs-filters">
          <Field label="Tienda"><input value={data.tienda} disabled /></Field>
          <Field label="Estado">
            <select value={estado} onChange={(event) => setEstado(event.target.value)}>
              <option value="todos">Todos</option>
              {Object.entries(estados).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </Field>
        </div>
        {rows.length ? <div className="table-panel legal-docs-panel">
          <div className="data-table data-table--legal-docs">
            <div className="data-table__head"><span>Documento</span><span>N.º / referencia</span><span>Emisión</span><span>Vencimiento</span><span>Estado</span><span>Archivo</span></div>
            {rows.map((item) => <div className="data-table__row" key={item.id}>
              <strong className="cell-primary">{item.documento}</strong>
              <span className="mono">{item.referencia}</span>
              <span>{formatDate(item.fecha_emision)}</span>
              <span>{formatDate(item.fecha_vencimiento)}</span>
              <StatusBadge value={item.estado} label={estados[item.estado]} />
              <button className="legal-file-button" onClick={() => openFile(item.id)} title={`Abrir ${item.archivo_nombre}`}><FileText size={16} /><span>PDF</span><ExternalLink size={12} /></button>
            </div>)}
          </div>
        </div> : <EmptyState icon={FileText} title="Sin documentos legales" text={estado === "todos" ? "Sube el primer documento legal de esta tienda." : "No hay documentos con este estado."} />}
      </>}

      <Modal open={!!editing} title="Subir documento legal" subtitle="El PDF quedará asociado únicamente a tu tienda." onClose={() => !busy && setEditing(null)} wide>
        {editing && <form className="form-grid" onSubmit={save} noValidate>
          <Field label="Documento" error={errors.documento}><input maxLength={160} value={editing.documento} onChange={(event) => setEditing({ ...editing, documento: event.target.value })} placeholder="Ej. Licencia de funcionamiento" /></Field>
          <Field label="N.º / referencia" error={errors.referencia}><input maxLength={100} value={editing.referencia} onChange={(event) => setEditing({ ...editing, referencia: event.target.value })} placeholder="Ej. LF-2026-041" /></Field>
          <Field label="Fecha de emisión" error={errors.fecha_emision}><input type="date" value={editing.fecha_emision} onChange={(event) => setEditing({ ...editing, fecha_emision: event.target.value })} /></Field>
          <Field label="Fecha de vencimiento" hint="Déjala vacía si no vence." error={errors.fecha_vencimiento}><input type="date" min={editing.fecha_emision} value={editing.fecha_vencimiento} onChange={(event) => setEditing({ ...editing, fecha_vencimiento: event.target.value })} /></Field>
          <Field label="Archivo PDF" hint="Máximo 4 MB." error={errors.archivo} className="span-2">
            <label className="legal-file-picker"><Upload size={20} /><span>{editing.archivo?.name || "Seleccionar archivo PDF"}</span><input type="file" accept="application/pdf,.pdf" onChange={(event) => setEditing({ ...editing, archivo: event.target.files?.[0] || null })} /></label>
          </Field>
          <div className="form-actions span-2">
            <button type="button" className="button button--ghost" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button>
            <button className="button button--primary" disabled={busy}>{busy ? "Subiendo…" : "Subir documento"}</button>
          </div>
        </form>}
      </Modal>
    </>
  );
}
