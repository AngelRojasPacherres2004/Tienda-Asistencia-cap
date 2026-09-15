import { useEffect, useMemo, useState } from "react";
import { Download, Plus, UsersRound } from "lucide-react";
import { api, todayISO } from "../lib/api";
import { EmptyState, Field, Loading, Modal, Notice, PageHeader, StatusBadge, SuccessDialog } from "../components/UI";

const nowTime = () => new Date().toLocaleTimeString("en-GB", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });
const blank = () => ({ fecha: todayISO(), hora: nowTime(), momento: "jornada", visitantes: "", estado: "registrado", observacion: "" });

export default function Trafico() {
  const [items, setItems] = useState(null); const [editing, setEditing] = useState(null); const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); const [success, setSuccess] = useState(false); const [search, setSearch] = useState("");
  const load = () => api("/trafico").then(setItems).catch((error) => { setItems([]); setNotice({ type: "error", text: error.message }); });
  useEffect(() => { load(); }, []);
  const rows = useMemo(() => (items || []).filter((item) => `${item.fecha} ${item.observacion || ""}`.toLowerCase().includes(search.toLowerCase())), [items, search]);
  const today = (items || []).find((item) => item.fecha === todayISO() && item.estado === "registrado");
  const recent = (items || []).filter((item) => item.visitantes != null).slice(0, 7);
  const average = recent.length ? Math.round(recent.reduce((sum, item) => sum + item.visitantes, 0) / recent.length) : 0;
  const save = async (event) => { event.preventDefault(); setBusy(true); setNotice(null); try { await api("/trafico", { method: "POST", body: editing }); setEditing(null); await load(); setSuccess(true); } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); } };
  const exportCsv = () => { const csv = ["Fecha,Visitantes,Estado,Hora,Observación", ...rows.map((r) => [r.fecha, r.visitantes ?? "", r.estado, r.hora, `"${(r.observacion || "").replaceAll('"', '""')}"`].join(","))].join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "trafico-tienda.csv"; link.click(); URL.revokeObjectURL(url); };
  return <>
    <PageHeader eyebrow="Seguridad" title="Tráfico de clientes" subtitle="Registro diario e histórico de afluencia." action={<button className="button button--primary" onClick={() => setEditing(blank())}><Plus size={16} />Registrar tráfico</button>} />
    {notice && <Notice type={notice.type}>{notice.text}</Notice>}
    <section className="compact-metrics security-metrics"><div><span>Tráfico hoy</span><strong>{today?.visitantes ?? "—"}</strong><small>{today ? `Registrado · ${String(today.hora).slice(0, 5)}` : "Pendiente"}</small></div><div><span>Promedio 7 registros</span><strong>{average}</strong><small>Últimos registros</small></div><div><span>Pendientes</span><strong>{today ? 0 : 1}</strong><small>{today ? "Todo al día" : "Falta registrar hoy"}</small></div></section>
    <section className="panel"><header className="panel__header"><div><h2>Historial de tráfico</h2><p>Registros de afluencia de tu tienda</p></div><button className="button button--ghost" onClick={exportCsv}><Download size={15} />Exportar</button></header><div className="toolbar"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar fecha u observación" /></div>
      {!items ? <Loading /> : rows.length ? <div className="data-table data-table--traffic"><div className="data-table__head"><span>Fecha</span><span>Visitantes</span><span>Estado</span><span>Hora</span><span>Observación</span></div>{rows.map((item) => <div className="data-table__row" key={item.id}><strong>{item.fecha}</strong><span>{item.visitantes ?? "—"}</span><span><StatusBadge value={item.estado} /></span><span>{String(item.hora).slice(0,5)}</span><span>{item.observacion || "Sin observaciones"}</span></div>)}</div> : <EmptyState icon={UsersRound} title="Sin registros" text="Registra el tráfico de clientes de hoy." />}
    </section>
    <Modal open={!!editing} title="Registrar tráfico" subtitle="Registro rápido del conteo de visitantes." onClose={() => !busy && setEditing(null)}>{editing && <form className="form-grid" onSubmit={save}><Field label="Fecha"><input type="date" required value={editing.fecha} onChange={(e) => setEditing({ ...editing, fecha: e.target.value })} /></Field><Field label="Franja / momento"><select value={editing.momento} onChange={(e) => setEditing({ ...editing, momento: e.target.value })}><option value="apertura">Apertura</option><option value="media_jornada">Media jornada</option><option value="cierre">Cierre</option><option value="jornada">Jornada</option></select></Field><Field label="Hora"><input type="time" required value={editing.hora} onChange={(e) => setEditing({ ...editing, hora: e.target.value })} /></Field><Field label="Cantidad de visitantes"><input type="number" min="0" required value={editing.visitantes} onChange={(e) => setEditing({ ...editing, visitantes: e.target.value })} /></Field><Field label="Observación" className="span-2"><textarea rows="5" maxLength="1000" value={editing.observacion} onChange={(e) => setEditing({ ...editing, observacion: e.target.value })} /></Field><div className="form-actions span-2"><button type="button" className="button button--ghost" onClick={() => setEditing(null)}>Cancelar</button><button className="button button--primary" disabled={busy}>{busy ? "Registrando…" : "Registrar tráfico"}</button></div></form>}</Modal>
    <SuccessDialog open={success} title="Tráfico registrado" message="El conteo quedó guardado correctamente." onContinue={() => setSuccess(false)} />
  </>;
}
