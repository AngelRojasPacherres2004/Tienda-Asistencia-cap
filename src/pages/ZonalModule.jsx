import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarCheck2, ClipboardCheck, Plus, Search, UsersRound } from "lucide-react";
import { api, formatDate, formatDateTime, todayISO } from "../lib/api";
import { EmptyState, Field, Loading, Modal, Notice, PageHeader, StatusBadge } from "../components/UI";

const labels = {
  personal: ["Personal", "Trabajadores de las tiendas de tu zona, cargos, ingresos y salidas."],
  asistencia: ["Asistencia", "Cumplimiento diario, faltas, tardanzas y hora del último envío por tienda."],
  tareas: ["Cronogramas y tareas", "Asigna responsables y fechas límite, y controla el cumplimiento."],
  supervisiones: ["Supervisiones", "Registra visitas, checklists, observaciones, hallazgos y acciones correctivas."],
  incidencias: ["Incidencias", "Consulta y da seguimiento a las incidencias de todas tus tiendas."],
};

export default function ZonalModule({ section }) {
  const [data, setData] = useState(null); const [stores, setStores] = useState([]); const [notice, setNotice] = useState(null); const [search, setSearch] = useState(""); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(blank(section));
  const load = useCallback(() => { setData(null); api(`/zonal/${section}`).then(setData).catch((error) => setNotice({ type: "error", text: error.message })); }, [section]);
  useEffect(() => { load(); if (["tareas", "supervisiones"].includes(section)) api("/tiendas").then(setStores).catch(() => setStores([])); }, [load, section]);
  const create = async (event) => { event.preventDefault(); setBusy(true); try { await api(`/zonal/${section}`, { method: "POST", body: form }); setOpen(false); setForm(blank(section)); await load(); } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); } };
  const changeTask = async (id, estado) => { try { await api(`/zonal/tareas/${id}`, { method: "PUT", body: { estado } }); await load(); } catch (error) { setNotice({ type: "error", text: error.message }); } };
  const title = labels[section] || ["Resumen zonal", ""];
  return <>
    <PageHeader eyebrow="Jefe zonal" title={title[0]} subtitle={title[1]} action={["tareas", "supervisiones"].includes(section) && <button className="button button--primary" onClick={() => { setForm(blank(section)); setOpen(true); }}><Plus size={16} />Nuevo registro</button>} />
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
    {section !== "asistencia" && <label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar…" /></label>}
    {!data ? <Loading /> : <Content section={section} data={data} search={search} changeTask={changeTask} />}
    <Modal open={open} wide title={section === "tareas" ? "Nueva tarea zonal" : "Nueva supervisión"} onClose={() => setOpen(false)}>
      <form className="form-grid" onSubmit={create}>
        <Field label="Tienda"><select required value={form.tienda_id} onChange={(e) => setForm({ ...form, tienda_id: e.target.value })}><option value="">Selecciona</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.nombre}</option>)}</select></Field>
        {section === "tareas" ? <TaskFields form={form} setForm={setForm} /> : <SupervisionFields form={form} setForm={setForm} />}
        <div className="form-actions span-2"><button type="button" className="button button--ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="button button--primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button></div>
      </form>
    </Modal>
  </>;
}

function Content({ section, data, search, changeTask }) {
  if (section === "asistencia") return data.tiendas.length ? <div className="cards-list">{data.tiendas.map((row) => <article className="task-catalog-card" key={row.id}><span className="catalog-icon"><CalendarCheck2 size={18} /></span><div><strong>{row.nombre}</strong><span>{row.registrados}/{row.personal} registrados · {row.faltas} faltas · {row.tardanzas} tardanzas · {row.pendientes} pendientes</span></div><StatusBadge value={row.pendientes ? "pendiente" : "completado"} /><small>{row.ultimo_envio ? formatDateTime(row.ultimo_envio) : "Sin envío"}</small></article>)}</div> : <Empty icon={CalendarCheck2} title="Sin tiendas" />;
  if (section === "supervisiones") {
    const visits = filter(data.visitas, search); const observations = filter(data.observaciones, search);
    return <div className="ops-grid"><List title="Visitas y checklists" rows={visits} render={(row) => <><strong>{row.tiendas?.nombre}</strong><span>{formatDate(row.fecha)} · Puntaje {row.puntaje ?? "—"}</span><small>{row.observacion_general}</small></>} /><List title="Hallazgos y observaciones" rows={observations} render={(row) => <><strong>{row.area_item} · {row.tiendas?.nombre}</strong><span>{row.prioridad} · límite {formatDate(row.fecha_limite)}</span><small>{row.descripcion}</small><StatusBadge value={row.estado} /></>} /></div>;
  }
  const rows = filter(data, search);
  if (!rows.length) return <Empty icon={section === "personal" ? UsersRound : AlertTriangle} title="Sin registros" />;
  if (section === "personal") return <div className="table-panel"><div className="data-table data-table--trabajadores"><div className="data-table__head"><span>Persona</span><span>Tienda</span><span>Rol</span><span>Estado</span></div>{rows.map((row) => <div className="data-table__row" key={row.id}><div className="person-cell"><span className="avatar">{row.nombres?.[0]}</span><div><strong>{row.nombres} {row.apellidos}</strong><small>Ingreso {formatDate(row.fecha_ingreso)}{row.fecha_salida ? ` · Salida ${formatDate(row.fecha_salida)}` : ""}</small></div></div><span>{row.tienda_nombre}</span><span>{row.rol?.replaceAll("_", " ")}</span><StatusBadge value={row.estado} /></div>)}</div></div>;
  if (section === "tareas") return <div className="cards-list">{rows.map((row) => <article className="task-catalog-card" key={row.id}><span className="catalog-icon"><ClipboardCheck size={18} /></span><div><strong>{row.titulo}</strong><span>{row.tiendas?.nombre} · {row.responsable} · vence {formatDate(row.fecha_limite)}</span></div><select value={row.estado} onChange={(event) => changeTask(row.id, event.target.value)}><option value="pendiente">Pendiente</option><option value="en_progreso">En progreso</option><option value="completada">Completada</option><option value="cancelada">Cancelada</option></select><StatusBadge value={row.prioridad} /></article>)}</div>;
  return <div className="cards-list">{rows.map((row) => <article className="task-catalog-card" key={row.id}><span className="catalog-icon"><AlertTriangle size={18} /></span><div><strong>{row.codigo || `INC-${row.id}`} · {row.tiendas?.nombre}</strong><span>{row.asunto || row.tipo} · {row.descripcion}</span></div><StatusBadge value={row.estado || "abierta"} /><small>{formatDateTime(row.fecha)}</small></article>)}</div>;
}

function TaskFields({ form, setForm }) { return <><Field label="Título"><input required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></Field><Field label="Responsable"><input required value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} /></Field><Field label="Fecha de inicio"><input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} /></Field><Field label="Fecha límite"><input required type="date" value={form.fecha_limite} onChange={(e) => setForm({ ...form, fecha_limite: e.target.value })} /></Field><Field label="Prioridad"><select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></Field><Field label="Descripción" className="span-2"><textarea rows="3" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></Field></>; }
function SupervisionFields({ form, setForm }) { return <><Field label="Fecha"><input required type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></Field><Field label="Periodo"><input placeholder="Ej. Setiembre 2026" value={form.periodo} onChange={(e) => setForm({ ...form, periodo: e.target.value })} /></Field><Field label="Puntaje"><input type="number" min="0" max="100" value={form.puntaje} onChange={(e) => setForm({ ...form, puntaje: e.target.value })} /></Field><Field label="Checklist / formato"><input value={form.checklist_nombre} onChange={(e) => setForm({ ...form, checklist_nombre: e.target.value })} /></Field><Field label="Observación general" className="span-2"><textarea required rows="3" value={form.observacion_general} onChange={(e) => setForm({ ...form, observacion_general: e.target.value })} /></Field><Field label="Área del hallazgo"><input value={form.area_item} onChange={(e) => setForm({ ...form, area_item: e.target.value })} /></Field><Field label="Prioridad"><select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></Field><Field label="Hallazgo" className="span-2"><textarea rows="3" value={form.hallazgo} onChange={(e) => setForm({ ...form, hallazgo: e.target.value })} /></Field><Field label="Acción correctiva"><textarea rows="3" value={form.accion_solicitada} onChange={(e) => setForm({ ...form, accion_solicitada: e.target.value })} /></Field><Field label="Fecha límite"><input type="date" value={form.fecha_limite} onChange={(e) => setForm({ ...form, fecha_limite: e.target.value })} /></Field></>; }
function List({ title, rows, render }) { return <section className="panel"><header className="panel__header"><h2>{title}</h2></header>{rows.length ? rows.map((row) => <div className="ops-row" key={row.id}>{render(row)}</div>) : <p>Sin registros.</p>}</section>; }
function Empty({ icon, title }) { return <EmptyState icon={icon} title={title} text="No hay información disponible para las tiendas de tu zona." />; }
function filter(rows, search) { const term = search.toLowerCase(); return (rows || []).filter((row) => JSON.stringify(row).toLowerCase().includes(term)); }
function blank(section) { return section === "tareas" ? { tienda_id: "", titulo: "", descripcion: "", responsable: "", fecha_inicio: todayISO(), fecha_limite: "", prioridad: "media" } : { tienda_id: "", fecha: todayISO(), periodo: "", puntaje: "", checklist_nombre: "", observacion_general: "", area_item: "", prioridad: "media", hallazgo: "", accion_solicitada: "", fecha_limite: "" }; }
