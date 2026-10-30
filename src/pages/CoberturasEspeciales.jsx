import { useEffect, useState } from "react";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { api, todayISO } from "../lib/api";
import { EmptyState, Loading, Modal, Notice, PageHeader, StatusBadge } from "../components/UI";
import { laborAreaOptions, normalizeLaborArea } from "../lib/laborAreas";

const blankWorker = () => ({ usuario_id: "", dni: "", manual: true, tienda_id: "", nombre_manual: "", origen_manual: "", area: "", horas: "", observacion: "", lookup_error: "" });

export default function CoberturasEspeciales() {
  const [rows, setRows] = useState(null);
  const [people, setPeople] = useState([]);
  const [workers, setWorkers] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => Promise.all([api("/coberturas-especiales"), api("/coberturas-personal")])
    .then(([coverages, users]) => { setRows(coverages); setPeople(users); })
    .catch(err => setRows({ error: err.message }));
  useEffect(() => { load(); }, []);
  const areas = laborAreaOptions(people.map(person => person.area_laboral));
  const stores = [...new Map(people.filter(person => person.tienda_id).map(person => [String(person.tienda_id), { id: String(person.tienda_id), nombre: person.tienda_nombre || `Tienda ${person.tienda_id}` }])).values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const updateWorker = (index, values) => setWorkers(current => current.map((row, i) => i === index ? { ...row, ...values } : row));
  const selectWorker = (index, value) => {
    const person = people.find(item => String(item.id) === value);
    updateWorker(index, person ? { manual: false, usuario_id: String(person.id), tienda_id: String(person.tienda_id), dni: person.dni || "", area: normalizeLaborArea(person.area_laboral), lookup_error: "" } : { usuario_id: "", dni: "", area: "", lookup_error: "" });
  };
  const findByDni = (index, value) => {
    const dni = value.replace(/\D/g, '').slice(0, 8);
    const row = workers[index];
    if (row.manual) { updateWorker(index, { dni }); return; }
    const person = dni.length === 8 ? people.find(item => item.dni === dni) : null;
    if (person) selectWorker(index, String(person.id));
    else updateWorker(index, { dni, usuario_id: '', area: '', lookup_error: dni.length === 8 ? 'No se encontró un trabajador activo con ese DNI en otra tienda.' : '' });
  };
  const save = async () => {
    setError("");
    if (!workers.length) return setError("Agrega al menos un trabajador.");
    for (const row of workers) {
      const hours = Number(row.horas);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24 || Math.round(hours * 100) / 100 !== hours) return setError("Indica las horas de apoyo de cada trabajador: mayor que 0 y hasta 24, con máximo dos decimales.");
      if (row.manual && (!row.nombre_manual.trim())) return setError("Completa el nombre de cada persona.");
      if (!row.manual && !row.usuario_id) return setError("Ingresa un DNI válido o selecciona un trabajador de la tienda.");
      if (row.dni && !/^\d{8}$/.test(row.dni)) return setError("El DNI debe tener 8 dígitos o quedar vacío.");
    }
    setBusy(true);
    try {
      await api("/coberturas-especiales", { method: "POST", body: { trabajadores: workers.map(row => ({ ...row, usuario_id: row.manual ? null : row.usuario_id })) } });
      setWorkers(null);
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  if (rows === null) return <Loading />;
  return <>
    <PageHeader eyebrow="Personal" title="Cobertura del día" subtitle="Registra al personal de apoyo de hoy. Su asistencia se marcará automáticamente como Apoyo (ingreso)." action={<button className="button button--primary" onClick={() => { setError(""); setWorkers([blankWorker()]); }}><Plus size={16} /> Registrar apoyo</button>} />
    {!Array.isArray(rows) && <Notice type="error">{rows.error}</Notice>}
    {Array.isArray(rows) && rows.length ? <div className="coverage-list">{rows.map(row => <section className="panel" key={row.id}>
      <header><div><strong>{row.motivo}</strong><span>{row.fecha_inicio}{row.fecha_fin !== row.fecha_inicio ? " al " + row.fecha_fin : ""}</span></div><StatusBadge value={row.estado} /></header>
      <div>{row.cobertura_trabajadores.map(person => <p key={person.id}>{person.usuario_id ? [person.usuarios?.nombres, person.usuarios?.apellidos].filter(Boolean).join(" ") : person.nombre_manual} · {person.area || "Sin área"}{person.horas != null && <> · {new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(Number(person.horas))} h</>} · {person.origen?.nombre || person.origen_manual || "Nuevo trabajador"} → {person.destino?.nombre}</p>)}</div>
    </section>)}</div> : <EmptyState icon={CalendarDays} title="Sin coberturas" text="Registra al personal que está apoyando hoy en tu tienda." />}
    <Modal open={workers !== null} extraWide title="Registrar apoyo del día" subtitle={"Fecha: " + todayISO() + " · Se añadirá a Asistencias con Apoyo (ingreso) seleccionado y bloqueado."} onClose={() => { if (!busy) setWorkers(null); }}>
      {workers && <div className="form-grid">
        {error && <div className="span-2"><Notice type="error" onClose={() => setError("")}>{error}</Notice></div>}
        <div className="form-section-title span-2"><strong>Datos del personal</strong><button type="button" disabled={busy} className="button button--ghost" onClick={() => setWorkers(current => [...current, blankWorker()])}><Plus size={14} /> Agregar persona</button></div>
        <div className="coverage-workers span-2">{workers.map((row, index) => {
          return <div className="coverage-worker" key={index}>
            <label><span>Tipo de personal</span><select aria-label="Tipo de personal" disabled={busy} value={row.manual ? "nuevo" : "tienda"} onChange={e => updateWorker(index, { ...blankWorker(), manual: e.target.value === "nuevo", horas: row.horas, observacion: row.observacion })}><option value="nuevo">Nuevo trabajador</option><option value="tienda">Trabajador de una tienda</option></select></label>
            <label><span>{row.manual ? "DNI (opcional)" : "DNI del trabajador"}</span><input aria-label="DNI del trabajador" disabled={busy} inputMode="numeric" maxLength={8} placeholder={row.manual ? "DNI" : "Escribe el DNI"} value={row.dni} onChange={e => findByDni(index, e.target.value)} />{row.lookup_error && <small className="field-error" role="alert">{row.lookup_error}</small>}</label>
            {!row.manual && <label><span>Tienda de origen</span><select aria-label="Tienda de origen" disabled={busy} value={row.tienda_id} onChange={e => updateWorker(index, { tienda_id: e.target.value, usuario_id: "", dni: "", area: "", lookup_error: "" })}><option value="">Todas las tiendas</option>{stores.map(store => <option key={store.id} value={store.id}>{store.nombre}</option>)}</select></label>}
            <label><span>Nombres y apellidos</span>{row.manual ? <input disabled={busy} aria-label="Nombres y apellidos" maxLength={200} placeholder="Nombres y apellidos" value={row.nombre_manual} onChange={e => updateWorker(index, { nombre_manual: e.target.value })} /> : <select aria-label="Trabajador de la tienda" disabled={busy} value={row.usuario_id} onChange={e => selectWorker(index, e.target.value)}><option value="">Seleccionar</option>{people.filter(person => !row.tienda_id || String(person.tienda_id) === row.tienda_id).map(person => <option value={person.id} key={person.id}>{person.nombres} {person.apellidos}</option>)}</select>}</label>
            <label><span>Área</span><select aria-label="Área del trabajador" disabled={busy} value={row.area} onChange={e => updateWorker(index, { area: e.target.value })}><option value="">Sin área registrada</option>{areas.map(area => <option key={area} value={area}>{area}</option>)}</select></label>
            <label><span>Observación</span><input disabled={busy} maxLength={500} placeholder="Opcional" value={row.observacion} onChange={e => updateWorker(index, { observacion: e.target.value })} /></label>
            <label><span>Horas de apoyo</span><input aria-label="Horas de apoyo" type="number" inputMode="decimal" min="0.01" max="24" step="0.01" required disabled={busy} placeholder="Ej. 8 o 4.5" value={row.horas} onChange={e => updateWorker(index, { horas: e.target.value })} /></label>
            <button type="button" disabled={busy} className="icon-button danger" aria-label="Quitar persona" onClick={() => setWorkers(current => current.filter((_, i) => i !== index))}><Trash2 size={15} /></button>
          </div>;
        })}</div>
        <div className="form-actions span-2"><button className="button button--ghost" disabled={busy} onClick={() => setWorkers(null)}>Cancelar</button><button className="button button--primary" disabled={busy} onClick={save}>{busy ? "Registrando…" : "Registrar apoyo y asistencia"}</button></div>
      </div>}
    </Modal>
  </>;
}
