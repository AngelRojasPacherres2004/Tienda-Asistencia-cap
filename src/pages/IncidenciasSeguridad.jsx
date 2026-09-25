import { useEffect, useMemo, useState } from "react";
import { Download, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { api, downloadFile, formatDateTime } from "../lib/api";
import { EmptyState, Field, Loading, Modal, Notice, PageHeader, SearchInput } from "../components/UI";

const newProduct = () => ({ codigo: "", producto: "", sublinea: "", marca: "", cantidad: 1, valor: "", recuperado: false });
const newPerson = () => ({ nombre: "", rol: "Testigo", documento: "", observacion: "" });
const limaNow = (value = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { fecha_incidente: `${parts.year}-${parts.month}-${parts.day}`, hora_incidente: `${parts.hour}:${parts.minute}` };
};
const emptyForm = () => ({ ...limaNow(), tipo: "robo", area: "piso_venta", gravedad: "media", descripcion: "", intervencion: false, detencion: false, detencion_detalle: "", productos: [], personas: [] });

export default function IncidenciasSeguridad({ user, management = false }) {
  const [rows, setRows] = useState(null); const [open, setOpen] = useState(false); const [step, setStep] = useState(1); const [notice, setNotice] = useState(null); const [modalNotice, setModalNotice] = useState(null); const [search, setSearch] = useState(""); const [state, setState] = useState("todos"); const [severity, setSeverity] = useState("todas"); const [form, setForm] = useState(emptyForm);
  const load = () => api("/incidencias").then(setRows).catch((e) => setNotice({ type: "error", text: e.message }));
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => (rows || []).filter((r) => `${r.codigo || ""} ${r.tipo || ""} ${r.asunto} ${r.descripcion}`.toLowerCase().includes(search.toLowerCase()) && (state === "todos" || (r.estado || "abierta") === state) && (severity === "todas" || r.gravedad === severity)), [rows, search, state, severity]);
  const start = () => { setForm(emptyForm()); setStep(1); setModalNotice(null); setOpen(true); };
  const edit = (row) => { const when = limaNow(row.fecha); setForm({ ...emptyForm(), ...when, id: row.id, tipo: row.tipo, area: row.area, gravedad: row.gravedad, descripcion: row.descripcion || "", intervencion: Boolean(row.intervencion), detencion: Boolean(row.detencion), detencion_detalle: row.detencion_detalle || "", productos: (row.incidencia_productos || []).map((item) => ({ codigo: "", producto: item.producto, sublinea: "", marca: item.marcas?.nombre || "", cantidad: item.cantidad, valor: item.valor, recuperado: Boolean(item.recuperado) })), personas: (row.incidencia_personas || []).map((item) => ({ nombre: item.nombre, rol: item.rol, documento: item.documento || "", observacion: item.observacion || "" })) }); setStep(1); setModalNotice(null); setOpen(true); };
  const next = () => {
    if (step === 1 && (!form.fecha_incidente || !form.hora_incidente)) return setModalNotice("Completa la fecha y la hora de la incidencia.");
    if (step === 1 && !form.descripcion.trim()) return setModalNotice("Completa la descripción del hecho.");
    if (step === 1 && form.detencion && !form.detencion_detalle.trim()) return setModalNotice("Completa los detalles de la detención.");
    if (step === 2 && form.productos.some((p) => !p.producto.trim() || !p.marca.trim())) return setModalNotice("Cada producto debe tener producto y marca.");
    if (step === 2 && form.productos.some((p) => !Number.isInteger(Number(p.cantidad)) || Number(p.cantidad) < 1 || p.valor === "" || Number(p.valor) < 0)) return setModalNotice("La cantidad debe ser mayor a cero y el valor del producto no puede estar vacío ni ser negativo.");
    if (step === 2 && form.tipo !== "cambio_precio" && form.personas.some((p) => !p.nombre.trim() || !p.rol.trim())) return setModalNotice("Cada persona agregada debe tener nombre y rol.");
    setModalNotice(null); setStep((value) => Math.min(3, value + 1));
  };
  const save = async () => { try { const datedForm = { ...form, fecha: `${form.fecha_incidente}T${form.hora_incidente}:00-05:00` }; const body = form.tipo === "cambio_precio" ? { ...datedForm, personas: [], intervencion: false, detencion: false, detencion_detalle: "", productos: form.productos.map((item) => ({ ...item, recuperado: false })) } : datedForm; await api(form.id ? `/incidencias/${form.id}` : "/incidencias", { method: form.id ? "PUT" : "POST", body }); setOpen(false); setForm(emptyForm()); setModalNotice(null); await load(); } catch (error) { setModalNotice(error.message); } };
  const exportExcel = async () => { try { const now = new Date(); const filename = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-incidentes.xlsx`; await downloadFile("/api/incidencias/export.xlsx", filename); } catch (error) { setNotice({ type: "error", text: error.message }); } };
  if (!rows) return <Loading />;
  return <>
    <PageHeader eyebrow={management ? "Operación de tienda" : "Seguridad"} title="Incidencias" subtitle="Registro y seguimiento de incidencias de seguridad" action={<button className="button button--primary" onClick={start}><Plus size={16} /> Nueva incidencia</button>} />
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
    <section className="panel security-history"><div className="security-filter-grid"><SearchInput value={search} onChange={setSearch} placeholder="Código, tipo o detalle" /><select value={state} onChange={(e) => setState(e.target.value)}><option value="todos">Todos los estados</option><option value="abierta">Abiertas</option><option value="en_revision">En revisión</option><option value="cerrada">Cerradas</option></select><select value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="todas">Todas las severidades</option><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></select><button className="button button--ghost" onClick={exportExcel}><Download size={15} /> Exportar Excel</button></div>{filtered.length ? <div className="security-table"><div className="security-table__head security-table__head--incidents"><span>Código</span><span>Fecha</span><span>Tipo</span><span>Área</span><span>Severidad</span><span>Estado</span><span /></div>{filtered.map((r) => <div className="security-table__row security-table__row--incidents" key={r.id}><strong>{codeOf(r)}</strong><span>{formatDateTime(r.fecha)}</span><span>{label(r.tipo) || r.asunto}</span><span>{label(r.area) || "—"}</span><span className={`security-pill security-pill--${r.gravedad}`}>{r.gravedad}</span><span className="security-pill">{label(r.estado) || "Abierta"}</span><button className="icon-button" onClick={() => edit(r)} aria-label="Editar incidencia"><Pencil size={15} /></button></div>)}</div> : <EmptyState icon={ShieldCheck} title="Sin incidencias" text="No hay resultados para los filtros seleccionados." />}</section>
    <Modal open={open} title={form.id ? "Editar incidencia" : "Nueva incidencia"} subtitle="Registro guiado en 3 pasos" wide onClose={() => setOpen(false)}>
      <div className="incident-wizard">
        <div className="incident-steps">{["Datos generales", form.tipo === "cambio_precio" ? "Productos opcionales" : "Productos e involucrados", "Revisar y enviar"].map((name, index) => <button type="button" key={name} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""} onClick={() => index + 1 < step && setStep(index + 1)}><b>{index + 1}</b>{name}</button>)}</div>
        {modalNotice && <Notice type="error" onClose={() => setModalNotice(null)}>{modalNotice}</Notice>}
        {step === 1 && <GeneralStep form={form} setForm={setForm} user={user} />}
        {step === 2 && <DetailsStep form={form} setForm={setForm} />}
        {step === 3 && <ReviewStep form={form} user={user} />}
        <div className="incident-actions"><button type="button" className="button button--ghost" onClick={() => { setModalNotice(null); step === 1 ? setOpen(false) : setStep(step - 1); }}>{step === 1 ? "Cancelar" : "Volver"}</button>{step < 3 ? <button type="button" className="button button--primary" onClick={next}>Continuar</button> : <button type="button" className="button button--primary" onClick={save}>Enviar incidencia</button>}</div>
      </div>
    </Modal>
  </>;
}

function GeneralStep({ form, setForm, user }) {
  const changeType = (tipo) => setForm({ ...form, tipo, ...(tipo === "cambio_precio" ? { personas: [], intervencion: false, detencion: false, detencion_detalle: "" } : {}) });
  return <section className="incident-step"><h3>Datos generales</h3><div className="form-grid"><Field label="Código"><input disabled value={form.id ? `INC-${String(form.id).padStart(4, "0")}` : "Se asignará automáticamente"} /></Field><Field label="Tienda"><input disabled value={user?.tienda_nombre || "Tienda asignada automáticamente"} /></Field><Field label="Fecha"><input type="date" disabled value={form.fecha_incidente} /></Field><Field label="Hora (Lima)"><input type="time" required value={form.hora_incidente} onChange={(e) => setForm({ ...form, hora_incidente: e.target.value })} /></Field><Field label="Tipo de incidencia"><select value={form.tipo} onChange={(e) => changeType(e.target.value)}><option value="robo">Robo</option><option value="robo_frustrado">Robo frustrado</option><option value="cambio_precio">Cambio de precio</option><option value="otro">Otro</option></select></Field><Field label="Área o ubicación"><select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}><option value="piso_venta">Piso de venta</option><option value="textil">Textil</option><option value="calzado">Calzado</option><option value="caja">Caja</option><option value="almacen">Almacén</option><option value="ingreso">Ingreso</option><option value="exterior">Exterior</option><option value="otro">Otro</option></select></Field><Field label="Severidad"><select value={form.gravedad} onChange={(e) => setForm({ ...form, gravedad: e.target.value })}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></select></Field><Field label="Descripción del hecho" className="span-2" hint="Indica qué ocurrió, cómo fue detectado y qué acciones iniciales se tomaron."><textarea required rows="5" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></Field>{form.tipo !== "cambio_precio" && <><Choice label="¿Hubo intervención?" value={form.intervencion} onChange={(value) => setForm({ ...form, intervencion: value })} /><Choice label="¿Hubo detención?" value={form.detencion} onChange={(value) => setForm({ ...form, detencion: value, detencion_detalle: value ? form.detencion_detalle : "" })} />{form.detencion && <Field label="Detalle de la detención" className="span-2" hint="Indica quién fue detenido, por quién y qué acciones se realizaron."><textarea required rows="4" value={form.detencion_detalle} onChange={(e) => setForm({ ...form, detencion_detalle: e.target.value })} /></Field>}</>}</div></section>;
}

function DetailsStep({ form, setForm }) {
  const update = (key, index, field, value) => setForm({ ...form, [key]: form[key].map((item, i) => i === index ? { ...item, [field]: value } : item) });
  const remove = (key, index) => setForm({ ...form, [key]: form[key].filter((_, i) => i !== index) });
  const add = (key, item) => setForm({ ...form, [key]: [...form[key], item] });
  return <section className="incident-step"><h3>{form.tipo === "cambio_precio" ? "Productos (opcional)" : "Productos e involucrados"}</h3><SectionTitle title={form.tipo === "cambio_precio" ? "Productos (opcional)" : "Productos involucrados"} onAdd={() => add("productos", newProduct())} label="Agregar producto" />
    {form.productos.length === 0 ? <p className="incident-empty">No se agregaron productos.</p> : <div className="incident-entry-list">{form.productos.map((item, index) => <div className="incident-product" key={index}><ProductCodeField value={item.codigo} onCodeChange={(codigo) => update("productos", index, "codigo", codigo)} onSelect={(product) => setForm({ ...form, productos: form.productos.map((current, position) => position === index ? { ...current, codigo: product.codigo, producto: product.producto, sublinea: product.sublinea, marca: product.marca, valor: product.precio } : current) })} /><Field label="Producto"><input required readOnly value={productLabel(item)} placeholder="Se completa al elegir el código" /></Field><Field label="Marca"><input required readOnly value={item.marca} placeholder="Se completa al elegir el código" /></Field><Field label="Cantidad"><input type="number" min="1" value={item.cantidad} onChange={(e) => update("productos", index, "cantidad", e.target.value)} /></Field><Field label="Valor (S/)"><input type="number" min="0" step="0.01" value={item.valor} onChange={(e) => update("productos", index, "valor", e.target.value)} /></Field>{form.tipo !== "cambio_precio" && <Choice label="¿Recuperado?" value={item.recuperado} onChange={(value) => update("productos", index, "recuperado", value)} />}<button className="icon-button incident-remove" type="button" onClick={() => remove("productos", index)} aria-label="Quitar producto"><Trash2 size={17} /></button></div>)}</div>}
    {form.tipo !== "cambio_precio" && <><SectionTitle title="Personas involucradas" onAdd={() => add("personas", newPerson())} label="Agregar persona" />
      {form.personas.length === 0 ? <p className="incident-empty">No se agregaron personas.</p> : <div className="incident-entry-list">{form.personas.map((item, index) => <div className="incident-person" key={index}><Field label="Nombre"><input value={item.nombre} onChange={(e) => update("personas", index, "nombre", e.target.value)} /></Field><Field label="Rol"><select value={item.rol} onChange={(e) => update("personas", index, "rol", e.target.value)}><option value="Ladrón">Ladrón</option><option value="Testigo">Testigo</option><option value="Vendedor">Vendedor</option><option value="Externo">Externo</option></select></Field><Field label="Documento"><input value={item.documento} onChange={(e) => update("personas", index, "documento", e.target.value)} /></Field><Field label="Observación"><input value={item.observacion} onChange={(e) => update("personas", index, "observacion", e.target.value)} /></Field><button className="icon-button incident-remove" type="button" onClick={() => remove("personas", index)} aria-label="Quitar persona"><Trash2 size={17} /></button></div>)}</div>}</>}
  </section>;
}

function ReviewStep({ form, user }) {
  const total = form.productos.reduce((sum, item) => sum + Number(item.valor || 0) * Number(item.cantidad || 0), 0); const recovered = form.productos.filter((item) => item.recuperado).reduce((sum, item) => sum + Number(item.valor || 0) * Number(item.cantidad || 0), 0);
  return <section className="incident-step"><h3>Revisar incidencia antes de enviar</h3><div className="incident-review"><div><span className={`security-pill security-pill--${form.gravedad}`}>{label(form.gravedad)}</span><h2>{label(form.tipo)}</h2><p>{user?.tienda_nombre || "Tienda asignada"} · {label(form.area)}</p></div><p className="incident-review__description">{form.descripcion}</p>{form.detencion && <p className="incident-review__description"><strong>Detalle de la detención:</strong> {form.detencion_detalle}</p>}<div className="incident-review__metrics"><ReviewMetric title="Productos" value={form.productos.length} /><ReviewMetric title="Valor involucrado" value={`S/ ${total.toFixed(2)}`} />{form.tipo !== "cambio_precio" && <><ReviewMetric title="Recuperado" value={`S/ ${recovered.toFixed(2)}`} /><ReviewMetric title="Personas" value={form.personas.length} /><ReviewMetric title="Intervención" value={form.intervencion ? "Sí" : "No"} /><ReviewMetric title="Detención" value={form.detencion ? "Sí" : "No"} /></>}</div></div></section>;
}

function ProductCodeField({ value, onCodeChange, onSelect }) {
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const query = String(value || "").trim();
    if (query.length < 1) { setOptions([]); setOpen(false); return undefined; }
    const timer = window.setTimeout(() => {
      api(`/productos/catalogo?q=${encodeURIComponent(query)}`).then((rows) => { setOptions(rows); setOpen(true); }).catch(() => { setOptions([]); setOpen(false); });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [value]);
  const change = (event) => {
    const codigo = event.target.value;
    onCodeChange(codigo);
  };
  const choose = (item) => { onCodeChange(item.codigo); onSelect(item); setOpen(false); };
  return <Field label="Código" className="product-code-field"><input required value={value} placeholder="Escribe el código" autoComplete="off" onFocus={() => options.length && setOpen(true)} onChange={change} onBlur={() => window.setTimeout(() => setOpen(false), 150)} />{open && options.length > 0 && <div className="product-code-options">{options.map((item) => <button type="button" key={item.codigo} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}><strong>{item.codigo}</strong><span>{item.sublinea}</span><small>{item.marca}</small></button>)}</div>}</Field>;
}

function Choice({ label: title, value, onChange }) { return <div className="field"><span>{title}</span><div className="incident-choice"><button type="button" className={value ? "active" : ""} onClick={() => onChange(true)}>Sí</button><button type="button" className={!value ? "active" : ""} onClick={() => onChange(false)}>No</button></div></div>; }
function SectionTitle({ title, onAdd, label: buttonLabel }) { return <div className="incident-section-title"><h4>{title}</h4><button type="button" className="button button--ghost" onClick={onAdd}><Plus size={14} /> {buttonLabel}</button></div>; }
function ReviewMetric({ title, value }) { return <div><small>{title}</small><strong>{value}</strong></div>; }
function productLabel({ sublinea }) { return sublinea || ""; }
function codeOf(row) { return row.codigo || `INC-${String(row.id).padStart(4, "0")}`; }
function label(value) { return value ? value.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase()) : ""; }
