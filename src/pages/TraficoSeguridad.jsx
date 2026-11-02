import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Pencil, UsersRound } from "lucide-react";
import { api, downloadFile, formatDate, todayISO } from "../lib/api";
import { EmptyState, Loading, Notice, PageHeader, Pagination } from "../components/UI";

import TrafficMatrix from "../components/TrafficMatrix";

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
  const matrixRef = useRef(null);
  const initialHistory = useRef(true);
  const loadRequest = useRef(0);
  const [date, setDate] = useState(todayISO);
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    try {
      const data = await api(`/trafico?desde=${date}&hasta=${date}`);
      if (request !== loadRequest.current) return;
      if (initialHistory.current && date === todayISO() && !data.length) {
        initialHistory.current = false;
        const recent = await api(`/trafico?desde=${daysBefore(date, 31)}&hasta=${date}`);
        if (request !== loadRequest.current) return;
        const latest = recent.reduce((value, row) => row.fecha > value ? row.fecha : value, "");
        if (latest && latest !== date) { setDate(latest); return; }
      }
      initialHistory.current = false;
      setRows(data); setNotice(null);
    } catch (error) { if (request === loadRequest.current) { setRows([]); setNotice({ type: "error", text: error.message }); } }
  }, [date]);
  useEffect(() => { setRows(null); load(); }, [load]);
  useEffect(() => { setPage(1); }, [date]);
  const pages = Math.max(1, Math.ceil((rows || []).length / PAGE_SIZE));
  const visibleRows = (rows || []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openForm = () => matrixRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const saved = async () => { await load(); };
  const exportExcel = async () => {
    try {
      const now = new Date();
      const filename = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-trafico.xlsx`;
      await downloadFile(`/api/trafico/export.xlsx?desde=${date}&hasta=${date}`, filename);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    }
  };

  return <>
    <PageHeader eyebrow="Seguridad" title="Tráfico de clientes" subtitle="Registro diario e histórico de afluencia" />
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text} <button type="button" className="button button--ghost button--small" onClick={() => { setRows(null); load(); }}>Reintentar</button></Notice>}
    <section className="panel traffic-entry-panel" ref={matrixRef}>
      <header className="panel__header"><div><h2>Tráfico del día</h2><p>{user?.tienda_nombre || "Tienda asignada"}</p></div></header>
      <TrafficMatrix ranges={RANGOS_HORA} onSaved={saved} />
    </section>
    <section className="panel security-history">
      <header className="panel__header"><div><h2>Historial de tráfico</h2><p>Consulta y exporta los conteos registrados por rango horario</p></div><button className="button button--ghost" onClick={exportExcel}><Download size={15} /> Exportar Excel</button></header>
      <div className="security-filter-grid security-filter-grid--traffic"><label className="security-date-filter"><span>Fecha</span><input type="date" lang="es-PE" value={date} max={todayISO()} onChange={(event) => setDate(event.target.value || todayISO())} aria-label="Fecha del historial de tráfico, día mes y año" /></label></div>
      {!rows ? <Loading /> : rows.length ? <><div className="security-table">
        <div className="security-table__head security-table__head--traffic"><span>Fecha</span><span>Rango horario</span><span>Visitantes</span><span>Estado</span><span>Observación</span><span /></div>
        {visibleRows.map((row) => { const editable = isToday(row.fecha); return <div className="security-table__row security-table__row--traffic" key={row.id}><strong>{formatDate(row.fecha)}</strong><span>{rangeLabel(row.rango_hora)}</span><span>{row.cantidad}</span><span className="security-pill">Registrado</span><span>{row.observaciones || "Sin observaciones"}</span><button className="icon-button" disabled={!editable} title={editable ? "Editar tráfico" : "Solo se puede editar el día del registro"} onClick={() => editable && openForm()} aria-label="Editar tráfico"><Pencil size={15}/></button></div>; })}
      </div><Pagination page={page} pages={pages} onChange={setPage} /></> : <EmptyState icon={UsersRound} title="Sin registros" text="No hay registros para los filtros seleccionados." />}
    </section>

  </>;
}

function displayHour(hour) { return `${hour % 12 || 12}:00 ${hour < 12 ? "a. m." : "p. m."}`; }
function rangeLabel(value) { return RANGOS_HORA.find((rango) => rango.value === value)?.label || value || "Sin rango"; }
function daysBefore(date, days) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() - days); return value.toISOString().slice(0, 10); }
function isToday(value) { return Boolean(value) && String(value).slice(0, 10) === limaDate(new Date()); }
function limaDate(value) { const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); return `${parts.year}-${parts.month}-${parts.day}`; }
