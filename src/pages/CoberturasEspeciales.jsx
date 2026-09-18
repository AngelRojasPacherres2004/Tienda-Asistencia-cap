import { useEffect, useState } from "react";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { api, todayISO } from "../lib/api";
import { EmptyState, Field, Loading, Modal, Notice, PageHeader, StatusBadge } from "../components/UI";

const blank = () => ({ fecha_inicio: todayISO(), fecha_fin: todayISO(), tipo_dia: "sabado", motivo: "", estado: "borrador", trabajadores: [] });
const blankWorker = () => ({ usuario_id: "", area: "", hora_entrada: "", tipo_cobertura: "fijo", observacion: "" });

export default function CoberturasEspeciales() {
  const [rows, setRows] = useState(null); const [people, setPeople] = useState([]); const [form, setForm] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => Promise.all([api("/coberturas-especiales"), api("/coberturas-personal")]).then(([coverages, users]) => { setRows(coverages); setPeople(users); }).catch((err) => setRows({ error: err.message }));
  useEffect(() => { load(); }, []);
  const addWorker = () => setForm((current) => ({ ...current, trabajadores: [...current.trabajadores, blankWorker()] }));
  const updateWorker = (index, field, value) => setForm((current) => ({ ...current, trabajadores: current.trabajadores.map((row, i) => i === index ? { ...row, [field]: value } : row) }));
  const duplicate = () => { const previous = Array.isArray(rows) ? rows[0] : null; if (!previous) return; setForm({ ...blank(), tipo_dia: previous.tipo_dia, motivo: previous.motivo, trabajadores: previous.cobertura_trabajadores.map((row) => ({ usuario_id: String(row.usuario_id), area: row.area || "", hora_entrada: row.hora_entrada?.slice(0, 5) || "", tipo_cobertura: row.tipo_cobertura, observacion: row.observacion || "" })) }); };
  const save = async (state) => {
    setError("");
    if (!form.motivo.trim() || !form.trabajadores.length) return setError("Completa el motivo y agrega al menos un trabajador.");
    setBusy(true); try { await api("/coberturas-especiales", { method: "POST", body: { ...form, estado: state } }); setForm(null); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  if (rows === null) return <Loading />;
  return <>
    <PageHeader eyebrow="Personal" title="Cobertura especial" subtitle="Asigna trabajadores temporalmente durante un período corto." action={<div className="header-actions"><button className="button button--ghost" onClick={duplicate} disabled={!Array.isArray(rows) || !rows.length}>Duplicar anterior</button><button className="button button--primary" onClick={() => setForm(blank())}><Plus size={16} /> Nueva cobertura</button></div>} />
    {!Array.isArray(rows) && <Notice type="error">{rows.error}</Notice>}
    {Array.isArray(rows) && rows.length ? <div className="coverage-list">{rows.map((row) => <section className="panel" key={row.id}><header><div><strong>{row.motivo}</strong><span>{row.fecha_inicio} al {row.fecha_fin} · {row.tipo_dia}</span></div><StatusBadge value={row.estado} /></header><div>{row.cobertura_trabajadores.map((person) => <p key={person.id}>{person.usuarios?.nombres} {person.usuarios?.apellidos} · {person.area || "Sin área"} · {person.hora_entrada?.slice(0, 5)} · {person.tipo_cobertura} · {person.origen?.nombre} → {person.destino?.nombre}</p>)}</div></section>)}</div> : <EmptyState icon={CalendarDays} title="Sin coberturas" text="Todavía no se registraron coberturas especiales." />}
    <Modal open={!!form} wide title="Cobertura temporal" subtitle="Indica el período durante el que estará activa" onClose={() => setForm(null)}>{form && <div className="form-grid">
      {error && <div className="span-2"><Notice type="error" onClose={() => setError("")}>{error}</Notice></div>}
      <Field label="Fecha de inicio"><input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} /></Field><Field label="Fecha de fin"><input type="date" min={form.fecha_inicio} value={form.fecha_fin} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} /></Field>
      <Field label="Tipo de día"><select value={form.tipo_dia} onChange={(e) => setForm({ ...form, tipo_dia: e.target.value })}><option value="sabado">Sábado</option><option value="domingo">Domingo</option><option value="feriado">Feriado</option><option value="especial">Día / evento especial</option></select></Field><Field label="Motivo"><input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} /></Field>
      <div className="form-section-title span-2"><strong>Personal</strong><button type="button" className="button button--ghost" onClick={addWorker}><Plus size={14} /> Agregar trabajador</button></div>
      <div className="coverage-workers span-2">{form.trabajadores.map((row, index) => { const selected = people.find((person) => String(person.id) === String(row.usuario_id)); return <div className="coverage-worker" key={index}><select value={row.usuario_id} onChange={(e) => { const person = people.find((item) => String(item.id) === e.target.value); updateWorker(index, "usuario_id", e.target.value); if (person?.area_laboral && !row.area) updateWorker(index, "area", person.area_laboral); }}><option value="">Trabajador</option>{people.map((person) => <option value={person.id} key={person.id}>{person.nombres} {person.apellidos} · {person.tienda_nombre}</option>)}</select><input placeholder="Área" value={row.area} onChange={(e) => updateWorker(index, "area", e.target.value)} /><input type="time" value={row.hora_entrada} onChange={(e) => updateWorker(index, "hora_entrada", e.target.value)} /><select value={row.tipo_cobertura} onChange={(e) => updateWorker(index, "tipo_cobertura", e.target.value)}><option value="fijo">Fijo</option><option value="apoyo">Apoyo</option></select><input disabled aria-label="Tienda de origen" value={selected?.tienda_nombre || "Tienda origen"} /><input disabled aria-label="Tienda de destino" value="Mi tienda" /><input placeholder="Observación" value={row.observacion} onChange={(e) => updateWorker(index, "observacion", e.target.value)} /><button className="icon-button danger" onClick={() => setForm((current) => ({ ...current, trabajadores: current.trabajadores.filter((_, i) => i !== index) }))}><Trash2 size={15} /></button></div>; })}</div>
      <div className="form-actions span-2"><button className="button button--ghost" disabled={busy} onClick={() => save("borrador")}>Guardar borrador</button><button className="button button--primary" disabled={busy} onClick={() => save("confirmada")}>Confirmar cobertura</button></div>
    </div>}</Modal>
  </>;
}
