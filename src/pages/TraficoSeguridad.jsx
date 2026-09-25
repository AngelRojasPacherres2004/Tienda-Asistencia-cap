import { useEffect, useMemo, useState } from "react";
import { Download, Pencil, Plus, UsersRound } from "lucide-react";
import { api, formatDate, todayISO } from "../lib/api";
import { exportExcel } from "../lib/excelExport";
import { EmptyState, Field, Loading, Modal, Notice, PageHeader, SearchInput } from "../components/UI";

const RANGOS_HORA = Array.from({ length: 13 }, (_, index) => {
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
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const load = () => api("/trafico").then(setRows).catch((error) => setNotice({ type: "error", text: error.message }));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => (rows || []).filter((row) =>
    `${row.fecha} ${row.rango_hora || ""} ${row.observaciones || ""}`.toLowerCase().includes(search.toLowerCase())
  ), [rows, search]);

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
  const exportCsv = () => exportExcel("trafico-tienda.xlsx", (rows || []).map((row) => ({ fecha: row.fecha, rango_horario: rangeLabel(row.rango_hora), visitantes: row.cantidad, observacion: row.observaciones || "" })), "Tráfico");

  if (!rows) return <Loading />;
  return <>
    <PageHeader eyebrow="Seguridad" title="Tráfico de clientes" subtitle="Registro diario e histórico de afluencia" action={<button className="button button--primary" onClick={openForm}><Plus size={16} /> Registrar tráfico</button>} />
    <section className="panel security-history">
      <header className="panel__header"><div><h2>Historial de tráfico</h2><p>Consulta y exporta los conteos registrados por rango horario</p></div><button className="button button--ghost" onClick={exportCsv}><Download size={15} /> Exportar</button></header>
      <div className="security-filters"><SearchInput value={search} onChange={setSearch} placeholder="Fecha, rango u observación" /></div>
      {filtered.length ? <div className="security-table">
        <div className="security-table__head security-table__head--traffic"><span>Fecha</span><span>Rango horario</span><span>Visitantes</span><span>Estado</span><span>Observación</span><span /></div>
        {filtered.map((row) => <div className="security-table__row security-table__row--traffic" key={row.id}><strong>{formatDate(row.fecha)}</strong><span>{rangeLabel(row.rango_hora)}</span><span>{row.cantidad}</span><span className="security-pill">Registrado</span><span>{row.observaciones || "Sin observaciones"}</span><button className="icon-button" onClick={() => editForm(row)} aria-label="Editar tráfico"><Pencil size={15}/></button></div>)}
      </div> : <EmptyState icon={UsersRound} title="Sin registros" text="Registra el primer conteo de visitantes." />}
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
  const rangeStart = Math.min(21, Math.max(9, limaHour));
  return `${String(rangeStart).padStart(2, "0")}:00-${String(rangeStart + 1).padStart(2, "0")}:00`;
}
function displayHour(hour) { return `${hour % 12 || 12}:00 ${hour < 12 ? "a. m." : "p. m."}`; }
function rangeLabel(value) { return RANGOS_HORA.find((rango) => rango.value === value)?.label || value || "Sin rango"; }
function quoted(value) { return `"${String(value || "").replaceAll('"', '""')}"`; }
function downloadCsv(name, lines) { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })); link.download = name; link.click(); URL.revokeObjectURL(link.href); }
