import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { api, formatDateTime } from "../lib/api";
import { EmptyState, Field, Loading, Modal, Notice, PageHeader, SearchInput } from "../components/UI";

const typeLabels = { accidente: "Accidente", dano_infraestructura: "Daño de infraestructura", problema_operativo: "Problema operativo", falla_interna: "Falla interna", otro: "Otro" };
const areaLabels = { piso_venta: "Piso de venta", textil: "Textil", calzado: "Calzado", caja: "Caja", almacen: "Almacén", ingreso: "Ingreso", exterior: "Exterior", otro: "Otro" };
const emptyForm = () => ({ tipo: "accidente", area: "piso_venta", gravedad: "media", descripcion: "" });

export default function IncidenciasTienda() {
  const [rows, setRows] = useState(null); const [search, setSearch] = useState(""); const [open, setOpen] = useState(false); const [form, setForm] = useState(emptyForm); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => api("/incidencias").then(setRows).catch((err) => setRows({ error: err.message }));
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => (Array.isArray(rows) ? rows : []).filter((row) => `${row.codigo || ""} ${typeLabels[row.tipo] || row.tipo} ${areaLabels[row.area] || row.area} ${row.descripcion || ""}`.toLowerCase().includes(search.toLowerCase())), [rows, search]);
  const start = () => { setForm(emptyForm()); setError(""); setOpen(true); };
  const save = async (event) => {
    event.preventDefault(); setError("");
    if (!form.descripcion.trim()) return setError("Completa la descripción de la incidencia.");
    setBusy(true);
    try { await api("/incidencias", { method: "POST", body: form }); setOpen(false); setForm(emptyForm()); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  if (rows === null) return <Loading />;
  return <>
    <PageHeader eyebrow="Operación de tienda" title="Incidencias internas" subtitle="Accidentes, daños, problemas operativos y fallas internas de la tienda." action={<button className="button button--primary" onClick={start}><Plus size={16} /> Nueva incidencia</button>} />
    {!Array.isArray(rows) && <Notice type="error">{rows.error}</Notice>}
    <section className="panel security-history"><div className="security-filter-grid"><SearchInput value={search} onChange={setSearch} placeholder="Código, tipo, área o descripción" /></div>{filtered.length ? <div className="security-table"><div className="security-table__head security-table__head--incidents"><span>Código</span><span>Fecha</span><span>Tipo</span><span>Área</span><span>Severidad</span><span>Estado</span></div>{filtered.map((row) => <div className="security-table__row security-table__row--incidents" key={row.id}><strong>{row.codigo || `INC-${String(row.id).padStart(4, "0")}`}</strong><span>{formatDateTime(row.fecha)}</span><span>{typeLabels[row.tipo] || row.tipo}</span><span>{areaLabels[row.area] || row.area}</span><span className={`security-pill security-pill--${row.gravedad}`}>{label(row.gravedad)}</span><span className="security-pill">{label(row.estado || "abierta")}</span></div>)}</div> : <EmptyState icon={AlertTriangle} title="Sin incidencias internas" text="No hay incidencias internas registradas con ese criterio." />}</section>
    <Modal open={open} title="Nueva incidencia interna" subtitle="Registra un hecho ocurrido dentro de la tienda" wide onClose={() => setOpen(false)}><form className="form-grid" onSubmit={save} noValidate>
      {error && <div className="span-2"><Notice type="error" onClose={() => setError("")}>{error}</Notice></div>}
      <Field label="Tipo"><select value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value })}>{Object.entries(typeLabels).map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></Field>
      <Field label="Área / ubicación"><select value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })}>{Object.entries(areaLabels).map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></Field>
      <Field label="Severidad"><select value={form.gravedad} onChange={(event) => setForm({ ...form, gravedad: event.target.value })}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></select></Field>
      <Field label="Descripción" className="span-2" hint="Describe qué ocurrió, dónde sucedió y las acciones tomadas."><textarea required rows="6" value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} /></Field>
      <div className="form-actions span-2"><button type="button" className="button button--ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="button button--primary" disabled={busy}>{busy ? "Guardando…" : "Guardar incidencia"}</button></div>
    </form></Modal>
  </>;
}

function label(value) { return String(value || "").replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase()); }
