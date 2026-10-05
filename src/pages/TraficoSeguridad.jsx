import { useEffect, useMemo, useState } from "react";
import { Download, Pencil, Plus, UsersRound } from "lucide-react";
import { api, downloadFile, formatDate, todayISO } from "../lib/api";
import { EmptyState, Field, Loading, Modal, Notice, PageHeader, Pagination, SearchInput } from "../components/UI";

const PAGE_SIZE = 15;

const RANGOS_HORA = Array.from({ length: 14 }, (_, index) => {
  const start = index + 9;
  const end = start + 1;
  return {
    value: `${String(start).padStart(2, "0")}:00-${String(end).padStart(2, "0")}:00`,
    label: `${displayHour(start)} - ${displayHour(end)}`,
  };
});

export default function TraficoSeguridad({ user }) {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [range, setRange] = useState("todos");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const load = () => api("/trafico").then(setRows).catch((error) => setNotice({ type: "error", text: error.message }));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => (rows || []).filter((row) =>
    `${row.fecha} ${row.rango_hora || ""} ${row.observaciones || ""}`.toLowerCase().includes(search.toLowerCase())
    && (!date || row.fecha === date)
    && (range === "todos" || row.rango_hora === range)
  ), [rows, search, date, range]);
  useEffect(() => { setPage(1); }, [search, date, range]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openForm = () => { setNotice(null); setForm(emptyForm()); setOpen(true); };
  const editForm = (row) => { setNotice(null); setForm({ id: row.id, fecha: row.fecha, rango_hora: row.rango_hora, cantidad: row.cantidad, observaciones: row.observaciones || "" }); setOpen(true); };
  const save = async (event) => {
    event.preventDefault();
    try {
      await api(form.id ? `/trafico/${form.id}` : "/trafico", { method: form.id ? "PUT" : "POST", body: form });
      setOpen(false);
      setForm(emptyForm());
      await load();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    }
  };
  const exportExcel = async () => {
    try {
      const now = new Date();
      const filename = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-trafico.xlsx`;
      await downloadFile("/api/trafico/export.xlsx", filename);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    }
  };

  if (!rows) return notice ? <Notice type="error">{notice.text}</Notice> : <Loading />;
  return <>
    <PageHeader eyebrow="Seguridad" title="Tráfico de clientes" subtitle="Registro diario e histórico de afluencia" action={<button className="button button--primary" onClick={openForm}><Plus size={16} /> Registrar tráfico</button>} />
    <section className="panel security-history">
      <header className="panel__header"><div><h2>Historial de tráfico</h2><p>Consulta y exporta los conteos registrados por rango horario</p></div><button className="button button--ghost" onClick={exportExcel}><Download size={15} /> Exportar Excel</button></header>
      <div className="security-filter-grid"><SearchInput value={search} onChange={setSearch} placeholder="Fecha, rango u observación" /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Filtrar por fecha" /><select value={range} onChange={(event) => setRange(event.target.value)} aria-label="Filtrar por rango horario"><option value="todos">Todos los horarios</option>{RANGOS_HORA.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
      {filtered.length ? <><div className="security-table">
        <div className="security-table__head security-table__head--traffic"><span>Fecha</span><span>Rango horario</span><span>Visitantes</span><span>Estado</span><span>Observación</span><span /></div>
        {visibleRows.map((row) => { const editable = isToday(row.fecha); return <div className="security-table__row security-table__row--traffic" key={row.id}><strong>{formatDate(row.fecha)}</strong><span>{rangeLabel(row.rango_hora)}</span><span>{row.cantidad}</span><span className="security-pill">Registrado</span><span>{row.observaciones || "Sin observaciones"}</span><button className="icon-button" disabled={!editable} title={editable ? "Editar tráfico" : "Solo se puede editar el día del registro"} onClick={() => editable && editForm(row)} aria-label="Editar tráfico"><Pencil size={15}/></button></div>; })}
      </div><Pagination page={page} pages={pages} onChange={setPage} /></> : <EmptyState icon={UsersRound} title="Sin registros" text="No hay registros para los filtros seleccionados." />}
    </section>
    <Modal open={open} title={form.id ? "Editar tráfico" : "Registrar tráfico"} subtitle="Conteo de visitantes de la tienda asignada" onClose={() => setOpen(false)}>
      <form className="form-grid" onSubmit={save}>
        {notice && <div className="span-2"><Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice></div>}
        <Field label="Tienda"><input disabled value={user?.tienda_nombre || "Tienda asignada automáticamente"} /></Field>
        <Field label="Fecha"><input required type="date" max={todayISO()} value={form.fecha} onChange={(event) => setForm({ ...form, fecha: event.target.value })} /></Field>
        <Field label="Rango horario"><select required value={form.rango_hora} onChange={(event) => setForm({ ...form, rango_hora: event.target.value })}>{RANGOS_HORA.map((rango) => <option key={rango.value} value={rango.value}>{rango.label}</option>)}</select></Field>
        <Field label="Cantidad de visitantes"><input required min="0" type="number" value={form.cantidad} onChange={(event) => setForm({ ...form, cantidad: event.target.value })} /></Field>
        <Field label="Observación (opcional)" className="span-2"><textarea rows="4" value={form.observaciones} onChange={(event) => setForm({ ...form, observaciones: event.target.value })} /></Field>
        <div className="form-actions span-2"><button type="button" className="button button--ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="button button--primary">{form.id ? "Guardar cambios" : "Registrar tráfico"}</button></div>
      </form>
    </Modal>
  </>;
}

function emptyForm() { return { fecha: todayISO(), rango_hora: currentRange(), cantidad: "", observaciones: "" }; }
function currentRange() {
  const limaHour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima", hour: "2-digit", hourCycle: "h23",
  }).format(new Date()));
  const rangeStart = Math.min(22, Math.max(9, limaHour));
  return `${String(rangeStart).padStart(2, "0")}:00-${String(rangeStart + 1).padStart(2, "0")}:00`;
}
function displayHour(hour) { return `${hour % 12 || 12}:00 ${hour < 12 ? "a. m." : "p. m."}`; }
function rangeLabel(value) { return RANGOS_HORA.find((rango) => rango.value === value)?.label || value || "Sin rango"; }
function isToday(value) { return Boolean(value) && String(value).slice(0, 10) === limaDate(new Date()); }
function limaDate(value) { const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); return `${parts.year}-${parts.month}-${parts.day}`; }
