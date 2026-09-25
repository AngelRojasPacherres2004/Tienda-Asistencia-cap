import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, Users } from "lucide-react";
import { api, todayISO } from "../lib/api";
import { EmptyState, Loading, Notice, PageHeader, SearchInput, SuccessDialog } from "../components/UI";

const estados = [
  { value: "presente", label: "Asistencia" },
  { value: "tardanza", label: "Tardanza" },
  { value: "medio_turno", label: "Medio turno" },
  { value: "apoyo", label: "Apoyo" },
  { value: "falta", label: "Falta" },
  { value: "permiso", label: "Permiso" },
  { value: "descanso_medico", label: "Descanso médico" },
  { value: "suspension", label: "Suspensión" },
];

export default function Asistencias() {
  const [fecha, setFecha] = useState(todayISO());
  const [autoToday, setAutoToday] = useState(true);
  const [mostrar, setMostrar] = useState("activo");
  const [search, setSearch] = useState("");
  const [roster, setRoster] = useState(null);
  const [pending, setPending] = useState({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [success, setSuccess] = useState(null);

  const loadRoster = useCallback(() => (
    api(`/asistencias?fecha=${fecha}&estado=${mostrar}`).then(setRoster).catch((error) => setNotice({ type: "error", text: error.message }))
  ), [fecha, mostrar]);
  useEffect(() => { setRoster(null); loadRoster(); }, [loadRoster]);
  useEffect(() => { setPending({}); }, [fecha]);
  useEffect(() => {
    const interval = setInterval(() => {
      const current = todayISO();
      if (autoToday) setFecha((value) => (value === current ? value : current));
    }, 60_000);
    return () => clearInterval(interval);
  }, [autoToday]);

  const onFechaChange = (value) => { setFecha(value); setAutoToday(value === todayISO()); };
  const empleados = useMemo(() => (roster?.empleados || []).map((employee) => {
    const draft = pending[employee.usuario_id];
    return draft ? { ...employee, registro: { estado: draft.estado, observaciones: draft.observaciones } } : employee;
  }), [roster, pending]);
  const visibles = useMemo(() => empleados.filter((employee) =>
    [employee.nombre, employee.dni].join(" ").toLowerCase().includes(search.toLowerCase()),
  ), [empleados, search]);
  const marcadosCount = empleados.filter((employee) => employee.registro).length;

  const marcar = (employee, estado) => setPending((current) => ({
    ...current,
    [employee.usuario_id]: { estado, observaciones: current[employee.usuario_id]?.observaciones ?? employee.registro?.observaciones ?? "" },
  }));
  const setObservacion = (employee, observaciones) => setPending((current) => ({
    ...current,
    [employee.usuario_id]: { estado: current[employee.usuario_id]?.estado ?? employee.registro?.estado, observaciones },
  }));
  const onSearchKeyDown = (event) => { if (event.key === "Enter" && visibles.length === 1) marcar(visibles[0], "presente"); };

  const guardarTodo = async () => {
    const marcas = Object.entries(pending).map(([usuarioId, draft]) => ({ usuario_id: Number(usuarioId), estado: draft.estado, observaciones: draft.observaciones || null }));
    if (!marcas.length) { setNotice({ type: "error", text: "No hay marcas nuevas para guardar." }); return; }
    setSaving(true); setNotice(null);
    try {
      const result = await api("/asistencias/lote", { method: "PUT", body: { fecha, marcas } });
      setPending({}); await loadRoster();
      setSuccess({ title: "Asistencia guardada", message: result.actualizados > 0 ? `Se guardaron los cambios de ${result.actualizados} trabajador(es).` : "La información ya estaba actualizada." });
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  };

  return <>
    <PageHeader eyebrow="Mi tienda" title="Gestión de asistencia" subtitle="Registra la asistencia diaria. Los registros anteriores y sus cambios están en la sección Historial."/>
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
    <div className="toolbar">
      <span>Fecha</span><input type="date" value={fecha} max={todayISO()} onChange={(event) => onFechaChange(event.target.value)}/>
      <span>Mostrar</span><select value={mostrar} onChange={(event) => setMostrar(event.target.value)}><option value="activo">Activos</option><option value="inactivo">Inactivos</option><option value="todos">Todos</option></select>
      <span>{marcadosCount} de {empleados.length} marcados</span>
      <button className="button button--ghost button--small" style={{ marginLeft: "auto" }} onClick={loadRoster}><RefreshCw size={14}/>Actualizar</button>
    </div>
    <div className="toolbar toolbar--filters"><SearchInput value={search} onChange={setSearch} onKeyDown={onSearchKeyDown} placeholder="Buscar trabajador… (Enter marca Asistencia si queda solo uno)"/></div>
    {!roster ? <Loading/> : visibles.length ? <div className="attendance-scroll"><div className="attendance-table">
      <div className="attendance-head"><span>Trabajador</span>{estados.map((state) => <span key={state.value}>{state.label}</span>)}<span>Observación</span></div>
      {visibles.map((employee) => <div className="attendance-row" key={employee.usuario_id}>
        <div className="person-cell"><span className="avatar">{employee.nombre.charAt(0).toUpperCase()}</span><div><strong>{employee.nombre}</strong><small>{employee.dni}{employee.estado === "inactivo" ? " · Inactivo" : ""}</small></div></div>
        {estados.map((state) => <button key={state.value} type="button" className={`attendance-check attendance-check--${state.value} ${employee.registro?.estado === state.value ? "checked" : ""}`} aria-label={`${state.label} para ${employee.nombre}`} onClick={() => marcar(employee, state.value)}>{employee.registro?.estado === state.value && <Check size={13}/>}</button>)}
        <input className="attendance-obs" maxLength={500} disabled={!employee.registro} placeholder={employee.registro ? "Observación (opcional)" : "Marca un estado primero"} value={employee.registro?.observaciones || ""} onChange={(event) => setObservacion(employee, event.target.value)}/>
      </div>)}
    </div></div> : <EmptyState icon={Users} title="Sin trabajadores" text="No hay trabajadores para mostrar con ese filtro."/>}
    <div className="form-actions"><button className="button button--primary" disabled={saving || !Object.keys(pending).length} onClick={guardarTodo}>{saving ? "Guardando…" : "Guardar asistencia"}</button></div>
    <SuccessDialog open={!!success} title={success?.title} message={success?.message} onContinue={() => setSuccess(null)}/>
  </>;
}
