import { useEffect, useMemo, useState } from "react";
import { Clock3, Download, Plus, TrendingUp, UsersRound } from "lucide-react";
import { api, formatDate, todayISO } from "../lib/api";
import { EmptyState, Field, Loading, Modal, Notice, PageHeader, SearchInput } from "../components/UI";

export default function TraficoSeguridad({ user }) {
  const [rows, setRows] = useState(null); const [open, setOpen] = useState(false); const [search, setSearch] = useState(""); const [notice, setNotice] = useState(null);
  const [form, setForm] = useState({ fecha: todayISO(), hora: currentTime(), cantidad: "", observaciones: "" });
  const load = () => api("/trafico").then(setRows).catch((e) => setNotice({ type: "error", text: e.message }));
  useEffect(() => { load(); }, []);
  const openForm = () => { setForm({ fecha: todayISO(), hora: currentTime(), cantidad: "", observaciones: "" }); setOpen(true); };
  const today = (rows || []).find((r) => r.fecha === todayISO()); const lastSeven = (rows || []).slice(0, 7); const average = lastSeven.length ? Math.round(lastSeven.reduce((sum, r) => sum + Number(r.cantidad), 0) / lastSeven.length) : 0;
  const filtered = useMemo(() => (rows || []).filter((r) => `${r.fecha} ${r.observaciones || ""}`.toLowerCase().includes(search.toLowerCase())), [rows, search]);
  const save = async (e) => { e.preventDefault(); try { await api("/trafico", { method: "POST", body: form }); setOpen(false); setForm({ fecha: todayISO(), hora: currentTime(), cantidad: "", observaciones: "" }); await load(); } catch (error) { setNotice({ type: "error", text: error.message }); } };
  const exportCsv = () => downloadCsv("trafico-tienda.csv", ["Fecha,Hora,Visitantes,Observación", ...(rows || []).map((r) => [r.fecha, displayTime(r.hora), r.cantidad, quoted(r.observaciones)].join(","))]);
  if (!rows) return <Loading />;
  return <>
    <PageHeader eyebrow="Seguridad" title="Tráfico de clientes" subtitle="Registro diario e histórico de afluencia" action={<button className="button button--primary" onClick={openForm}><Plus size={16} /> Registrar tráfico</button>} />
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
    <div className="security-metrics security-metrics--traffic"><Metric icon={UsersRound} label="Tráfico hoy" value={today?.cantidad ?? 0} footer={today ? "Registrado" : "Pendiente"} /><Metric icon={TrendingUp} label="Promedio 7 días" value={average} footer={`${lastSeven.length} registros considerados`} /><Metric icon={Clock3} label="Pendientes" value={today ? 0 : 1} footer={today ? "Todo al día" : "Falta el registro de hoy"} /></div>
    <section className="panel security-history"><header className="panel__header"><div><h2>Historial de tráfico</h2><p>Consulta y exporta los conteos registrados</p></div><button className="button button--ghost" onClick={exportCsv}><Download size={15} /> Exportar</button></header><div className="security-filters"><SearchInput value={search} onChange={setSearch} placeholder="Fecha u observación" /></div>{filtered.length ? <div className="security-table"><div className="security-table__head security-table__head--traffic"><span>Fecha</span><span>Hora</span><span>Visitantes</span><span>Estado</span><span>Observación</span></div>{filtered.map((r) => <div className="security-table__row security-table__row--traffic" key={r.id}><strong>{formatDate(r.fecha)}</strong><span>{displayTime(r.hora)}</span><span>{r.cantidad}</span><span className="security-pill">Registrado</span><span>{r.observaciones || "Sin observaciones"}</span></div>)}</div> : <EmptyState icon={UsersRound} title="Sin registros" text="Registra el primer conteo de visitantes." />}</section>
    <Modal open={open} title="Registrar tráfico" subtitle="Conteo de visitantes de la tienda asignada" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={save}><Field label="Tienda"><input disabled value={user?.tienda_nombre || "Tienda asignada automáticamente"} /></Field><Field label="Fecha"><input required type="date" max={todayISO()} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></Field><Field label="Hora"><input type="time" step="1" value={form.hora} disabled aria-label="Hora asignada automáticamente" /></Field><Field label="Cantidad de visitantes"><input required min="0" type="number" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} /></Field><Field label="Observación" className="span-2"><textarea rows="4" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></Field><div className="form-actions span-2"><button type="button" className="button button--ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="button button--primary">Registrar tráfico</button></div></form></Modal>
  </>;
}
function Metric({ icon: Icon, label, value, footer }) { return <article className="security-metric"><span className="security-metric__icon security-metric__icon--blue"><Icon size={20} /></span><div><small>{label}</small><strong>{value}</strong><em>{footer}</em></div></article>; }
function currentTime() { return new Date().toLocaleTimeString("en-GB", { timeZone: "America/Lima", hourCycle: "h23" }); }
function displayTime(value) { return value ? String(value).slice(0, 8) : "--:--:--"; }
function quoted(v) { return `"${String(v || "").replaceAll('"', '""')}"`; }
function downloadCsv(name, lines) { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })); link.download = name; link.click(); URL.revokeObjectURL(link.href); }
