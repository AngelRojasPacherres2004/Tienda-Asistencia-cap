import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Pencil, UsersRound } from "lucide-react";
import { api, downloadFile, formatDate, todayISO } from "../lib/api";
import { EmptyState, Loading, Notice, PageHeader, Pagination, SearchInput } from "../components/UI";

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
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [date, setDate] = useState("");
  const [range, setRange] = useState("todos");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState(null);

  const { from, to } = monthBounds(month);
  const load = useCallback(() => api(`/trafico?desde=${from}&hasta=${to}`).then((data) => { setRows(data); setNotice(null); }).catch((error) => { setRows([]); setNotice({ type: "error", text: error.message }); }), [from, to]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const filtered = useMemo(() => (rows || []).filter((row) =>
    `${row.fecha} ${row.rango_hora || ""} ${row.observaciones || ""}`.toLowerCase().includes(search.toLowerCase())
    && (!date || row.fecha === date)
    && (range === "todos" || row.rango_hora === range)
  ), [rows, search, date, range]);
  useEffect(() => { setPage(1); }, [search, date, range]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openForm = () => matrixRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const saved = async () => { await load(); };
  const exportExcel = async () => {
    try {
      const now = new Date();
      const filename = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-trafico.xlsx`;
      await downloadFile(`/api/trafico/export.xlsx?desde=${from}&hasta=${to}`, filename);
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
      <div className="security-filter-grid"><SearchInput value={search} onChange={setSearch} placeholder="Fecha, rango u observación" /><input type="month" value={month} max={todayISO().slice(0, 7)} onChange={(event) => { setMonth(event.target.value); setDate(""); }} aria-label="Mes del historial" /><input type="date" value={date} min={from} max={to} onChange={(event) => setDate(event.target.value)} aria-label="Filtrar por fecha" /><select value={range} onChange={(event) => setRange(event.target.value)} aria-label="Filtrar por rango horario"><option value="todos">Todos los horarios</option>{RANGOS_HORA.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
      {!rows ? <Loading /> : filtered.length ? <><div className="security-table">
        <div className="security-table__head security-table__head--traffic"><span>Fecha</span><span>Rango horario</span><span>Visitantes</span><span>Estado</span><span>Observación</span><span /></div>
        {visibleRows.map((row) => { const editable = isToday(row.fecha); return <div className="security-table__row security-table__row--traffic" key={row.id}><strong>{formatDate(row.fecha)}</strong><span>{rangeLabel(row.rango_hora)}</span><span>{row.cantidad}</span><span className="security-pill">Registrado</span><span>{row.observaciones || "Sin observaciones"}</span><button className="icon-button" disabled={!editable} title={editable ? "Editar tráfico" : "Solo se puede editar el día del registro"} onClick={() => editable && openForm()} aria-label="Editar tráfico"><Pencil size={15}/></button></div>; })}
      </div><Pagination page={page} pages={pages} onChange={setPage} /></> : <EmptyState icon={UsersRound} title="Sin registros" text="No hay registros para los filtros seleccionados." />}
    </section>

  </>;
}

function displayHour(hour) { return `${hour % 12 || 12}:00 ${hour < 12 ? "a. m." : "p. m."}`; }
function rangeLabel(value) { return RANGOS_HORA.find((rango) => rango.value === value)?.label || value || "Sin rango"; }
function monthBounds(value) { const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : todayISO().slice(0, 7); const [year, number] = month.split("-").map(Number); return { from: `${month}-01`, to: `${month}-${String(new Date(year, number, 0).getDate()).padStart(2, "0")}` }; }
function isToday(value) { return Boolean(value) && String(value).slice(0, 10) === limaDate(new Date()); }
function limaDate(value) { const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); return `${parts.year}-${parts.month}-${parts.day}`; }
