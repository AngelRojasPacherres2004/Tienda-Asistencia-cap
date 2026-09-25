import { useEffect, useState } from "react";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { api, todayISO } from "../lib/api";
import { EmptyState, Field, Loading, Modal, Notice, PageHeader, StatusBadge } from "../components/UI";

const blank = () => ({ fecha_inicio: todayISO(), fecha_fin: todayISO(), tipo_dia: "sabado", motivo: "", estado: "borrador", trabajadores: [] });
const blankWorker = () => ({ usuario_id: "", dni: "", area: "", hora_entrada: "", tipo_cobertura: "fijo", observacion: "" });

export default function CoberturasEspeciales() {
  const [rows, setRows] = useState(null); const [people, setPeople] = useState([]); const [form, setForm] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => Promise.all([api("/coberturas-especiales"), api("/coberturas-personal")]).then(([coverages, users]) => { setRows(coverages); setPeople(users); }).catch((err) => setRows({ error: err.message }));
  useEffect(() => { load(); }, []);
  const addWorker = () => setForm((current) => ({ ...current, trabajadores: [...current.trabajadores, blankWorker()] }));
  const areas = [...new Set(people.map((person) => person.area_laboral).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const updateWorker = (index, field, value) => setForm((current) => ({ ...current, trabajadores: current.trabajadores.map((row, i) => i === index ? { ...row, [field]: value } : row) }));
  const selectWorker = (index, person) => setForm((current) => ({ ...current, trabajadores: current.trabajadores.map((row, i) => i === index ? { ...row, usuario_id: person?.id ? String(person.id) : "", dni: person?.dni || row.dni, area: person?.area_laboral || row.area } : row) }));
  const findWorkerByDni = (index, dni) => { const cleanDni = dni.replace(/\D/g, "").slice(0, 8); const person = cleanDni.length === 8 ? people.find((item) => item.dni === cleanDni) : null; setForm((current) => ({ ...current, trabajadores: current.trabajadores.map((row, i) => i === index ? { ...row, dni: cleanDni, usuario_id: person ? String(person.id) : "", area: person?.area_laboral || row.area } : row) })); };
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
    <Modal open={!!form} extraWide title="Cobertura temporal" subtitle="Indica el período durante el que estará activa" onClose={() => setForm(null)}>{form && <div className="form-grid">
      {error && <div className="span-2"><Notice type="error" onClose={() => setError("")}>{error}</Notice></div>}
      <Field label="Fecha de inicio"><input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} /></Field><Field label="Fecha de fin"><input type="date" min={form.fecha_inicio} value={form.fecha_fin} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} /></Field>
      <Field label="Tipo de día"><select value={form.tipo_dia} onChange={(e) => setForm({ ...form, tipo_dia: e.target.value })}><option value="sabado">Sábado</option><option value="domingo">Domingo</option><option value="feriado">Feriado</option><option value="especial">Día / evento especial</option></select></Field><Field label="Motivo"><input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} /></Field>
      <div className="form-section-title span-2"><strong>Personal</strong><button type="button" className="button button--ghost" onClick={addWorker}><Plus size={14} /> Agregar trabajador</button></div>
      <div className="coverage-workers span-2">{form.trabajadores.map((row, index) => { const selected = people.find((person) => String(person.id) === String(row.usuario_id)); return <div className="coverage-worker" key={index}>
        <label><span>DNI (opcional)</span><input inputMode="numeric" maxLength="8" placeholder="DNI" value={row.dni} onChange={(e) => findWorkerByDni(index, e.target.value)} /></label>
        <label><span>Trabajador</span><select value={row.usuario_id} onChange={(e) => selectWorker(index, people.find((person) => String(person.id) === e.target.value))}><option value="">Seleccionar trabajador</option>{people.map((person) => <option value={person.id} key={person.id}>{person.nombres} {person.apellidos}</option>)}</select></label>
        <label><span>Área</span><select value={row.area} onChange={(e) => updateWorker(index, "area", e.target.value)}><option value="">Seleccionar área</option>{areas.map((area) => <option key={area} value={area}>{area}</option>)}</select></label>
        <label><span>Hora</span><input type="time" value={row.hora_entrada} onChange={(e) => updateWorker(index, "hora_entrada", e.target.value)} /></label>
        <label><span>Tipo</span><select value={row.tipo_cobertura} onChange={(e) => updateWorker(index, "tipo_cobertura", e.target.value)}><option value="fijo">Fijo</option><option value="apoyo">Apoyo</option></select></label>
        <label><span>Tienda de origen</span><input disabled value={selected?.tienda_nombre || "Se completa con DNI"} /></label>
        <label><span>Observación</span><input placeholder="Opcional" value={row.observacion} onChange={(e) => updateWorker(index, "observacion", e.target.value)} /></label>
        <button type="button" className="icon-button danger" aria-label="Quitar trabajador" onClick={() => setForm((current) => ({ ...current, trabajadores: current.trabajadores.filter((_, i) => i !== index) }))}><Trash2 size={15} /></button>
      </div>; })}</div>
      <div className="form-actions span-2"><button className="button button--ghost" disabled={busy} onClick={() => save("borrador")}>Guardar borrador</button><button className="button button--primary" disabled={busy} onClick={() => save("confirmada")}>Confirmar cobertura</button></div>
    </div>}</Modal>
  </>;
}
