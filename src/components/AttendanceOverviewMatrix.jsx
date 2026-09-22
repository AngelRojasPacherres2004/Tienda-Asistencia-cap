import { useEffect, useMemo, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { api, todayISO } from "../lib/api";
import { Loading, Notice } from "./UI";

const states = {
  presente: ["A", "Asistencia"], tardanza: ["T", "Tardanza"], medio_turno: ["M", "Medio turno"],
  apoyo: ["AP", "Apoyo"], falta: ["F", "Falta"], permiso: ["P", "Permiso"],
  descanso_medico: ["DM", "Descanso médico"], suspension: ["S", "Suspensión"],
};
const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function AttendanceOverviewMatrix({ tiendaId = "", scopeName = "" }) {
  const current = todayISO();
  const [month, setMonth] = useState(current.slice(0, 7));
  const [records, setRecords] = useState(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const daysCount = new Date(year, monthNumber, 0).getDate();
  const days = Array.from({ length: daysCount }, (_, index) => index + 1);

  useEffect(() => {
    let active = true;
    setRecords(null); setError("");
    api(`/asistencias/historial?desde=${month}-01&hasta=${month}-${String(daysCount).padStart(2, "0")}&estado_usuario=todos&orden=asc${tiendaId ? `&tienda_id=${tiendaId}` : ""}`)
      .then((rows) => { if (active) setRecords(rows); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [month, daysCount, tiendaId]);

  useEffect(() => {
    if (!expanded) return undefined;
    const prior = document.body.style.overflow;
    const close = (event) => { if (event.key === "Escape") setExpanded(false); };
    document.body.style.overflow = "hidden"; window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = prior; window.removeEventListener("keydown", close); };
  }, [expanded]);

  const people = useMemo(() => [...(records || []).reduce((map, row) => {
    if (!map.has(row.usuario_id)) map.set(row.usuario_id, { id: row.usuario_id, nombre: row.nombre || row.usuario || `Usuario ${row.usuario_id}` });
    return map;
  }, new Map()).values()].sort((a, b) => a.nombre.localeCompare(b.nombre)), [records]);
  const indexed = useMemo(() => new Map((records || []).map((row) => [`${row.usuario_id}-${Number(row.fecha.slice(8, 10))}`, row])), [records]);
  const registered = (records || []).length;
  const attendance = (records || []).filter((row) => ["presente", "tardanza", "medio_turno", "apoyo"].includes(row.estado)).length;

  return <section className={`panel attendance-overview ${expanded ? "attendance-overview--expanded" : ""}`}>
    <header className="panel__header attendance-matrix-header">
      <div><span className="eyebrow">Control mensual</span><h2>Matriz de asistencia</h2><p>{scopeName || "Vista consolidada"} · {monthNames[monthNumber - 1]} {year}</p></div>
      <div className="attendance-overview-actions"><label>Periodo<input type="month" max={current.slice(0, 7)} value={month} onChange={(event) => setMonth(event.target.value)} /></label><span className="panel-tag">{registered ? Math.round(attendance / registered * 100) : 0}% cumplimiento</span><button className="icon-button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Cerrar vista ampliada" : "Ampliar matriz"}>{expanded ? <Minimize2 size={17}/> : <Maximize2 size={17}/>}</button></div>
    </header>
    <div className="attendance-matrix-legend">{Object.entries(states).map(([key, value]) => <span key={key}><i className={`attendance-matrix-dot attendance-matrix-dot--${key}`}>{value[0]}</i>{value[1]}</span>)}</div>
    {error ? <Notice type="error">{error}</Notice> : records === null ? <Loading/> : people.length ? <div className="attendance-matrix-scroll"><div className="attendance-matrix" style={{ "--attendance-days": days.length }}>
      <div className="attendance-matrix-row attendance-matrix-row--totals"><strong className="attendance-matrix-person">Asistencia diaria</strong>{days.map((day) => <strong key={day}>{people.filter((person) => ["presente", "tardanza", "medio_turno", "apoyo"].includes(indexed.get(`${person.id}-${day}`)?.estado)).length}</strong>)}<strong className="attendance-matrix-total"/><strong className="attendance-matrix-total"/><strong className="attendance-matrix-total"/></div>
      <div className="attendance-matrix-row attendance-matrix-row--head"><span className="attendance-matrix-person">Colaborador</span>{days.map((day) => <span key={day}><small>{new Intl.DateTimeFormat("es-PE", { weekday: "narrow", timeZone: "UTC" }).format(new Date(`${month}-${String(day).padStart(2,"0")}T12:00:00Z`))}</small>{day}</span>)}<span className="attendance-matrix-total">A</span><span className="attendance-matrix-total">F</span><span className="attendance-matrix-total">T</span></div>
      {people.map((person) => { const personRecords = days.map((day) => indexed.get(`${person.id}-${day}`)); return <div className="attendance-matrix-row" key={person.id}><div className="attendance-matrix-person"><span className="avatar">{person.nombre.charAt(0)}</span><div><strong>{person.nombre}</strong><small>Registro mensual</small></div></div>{personRecords.map((record,index) => { const value=states[record?.estado]; return <span key={days[index]} className={`attendance-matrix-cell ${record ? `attendance-matrix-cell--${record.estado}` : ""}`} title={value?.[1] || "Sin registro"}>{value?.[0] || "·"}</span>; })}<strong className="attendance-matrix-total">{personRecords.filter((row)=>row?.estado==="presente").length}</strong><strong className="attendance-matrix-total">{personRecords.filter((row)=>row?.estado==="falta").length}</strong><strong className="attendance-matrix-total">{personRecords.filter((row)=>row?.estado==="tardanza").length}</strong></div>; })}
    </div></div> : <div className="panel-empty">No hay registros de asistencia para este periodo.</div>}
  </section>;
}
