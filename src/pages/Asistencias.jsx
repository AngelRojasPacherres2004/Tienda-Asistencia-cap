import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck2, Check, History, RefreshCw, Trash2, Users,
} from "lucide-react";
import {
  api, downloadFile, estadoAsistenciaLabels, formatDate, formatDateTime, todayISO,
} from "../lib/api";
import {
  EmptyState, Loading, Notice, PageHeader, SearchInput, StatusBadge, SuccessDialog,
} from "../components/UI";

const estados = [
  { value: "presente", label: "Asistencia" },
  { value: "tardanza", label: "Tardanza" },
  { value: "medio_turno", label: "Medio Turno" },
  { value: "apoyo", label: "Apoyo" },
  { value: "falta", label: "Falta" },
  { value: "permiso", label: "Permiso" },
  { value: "descanso_medico", label: "Descanso Médico" },
  { value: "suspension", label: "Suspensión" },
];
const operacionLabels = { creacion: "Creación", edicion: "Edición", eliminacion: "Eliminación" };

function daysInMonth(mes) {
  const [year, month] = mes.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function lastDayOfMonth(mes) {
  return `${mes}-${String(daysInMonth(mes)).padStart(2, "0")}`;
}

export default function Asistencias() {
  const [fecha, setFecha] = useState(todayISO());
  const [autoToday, setAutoToday] = useState(true);
  const [mostrar, setMostrar] = useState("activo");
  const [search, setSearch] = useState("");
  const [roster, setRoster] = useState(null);
  const [pending, setPending] = useState({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [tab, setTab] = useState("registros");
  const [success, setSuccess] = useState(null);

  const loadRoster = useCallback(() => (
    api(`/asistencias?fecha=${fecha}&estado=${mostrar}`).then(setRoster).catch((err) => setNotice({ type: "error", text: err.message }))
  ), [fecha, mostrar]);
  useEffect(() => { setRoster(null); loadRoster(); }, [loadRoster]);
  useEffect(() => { setPending({}); }, [fecha]);

  useEffect(() => {
    const interval = setInterval(() => {
      const nowToday = todayISO();
      if (autoToday) setFecha((current) => (current === nowToday ? current : nowToday));
    }, 60_000);
    return () => clearInterval(interval);
  }, [autoToday]);

  const onFechaChange = (value) => {
    setFecha(value);
    setAutoToday(value === todayISO());
  };

  const empleados = useMemo(() => (roster?.empleados || []).map((emp) => {
    const draft = pending[emp.usuario_id];
    return draft ? { ...emp, registro: { estado: draft.estado, observaciones: draft.observaciones } } : emp;
  }), [roster, pending]);
  const visibles = useMemo(() => empleados.filter((emp) =>
    [emp.nombre, emp.dni].join(" ").toLowerCase().includes(search.toLowerCase()),
  ), [empleados, search]);
  const marcadosCount = empleados.filter((emp) => emp.registro).length;

  const marcar = (emp, estadoValue) => setPending((current) => ({
    ...current,
    [emp.usuario_id]: { estado: estadoValue, observaciones: current[emp.usuario_id]?.observaciones ?? emp.registro?.observaciones ?? "" },
  }));
  const setObservacion = (emp, texto) => setPending((current) => ({
    ...current,
    [emp.usuario_id]: { estado: current[emp.usuario_id]?.estado ?? emp.registro?.estado, observaciones: texto },
  }));

  const onSearchKeyDown = (event) => {
    if (event.key === "Enter" && visibles.length === 1) marcar(visibles[0], "presente");
  };

  const guardarTodo = async () => {
    const marcas = Object.entries(pending).map(([usuarioId, draft]) => ({
      usuario_id: Number(usuarioId), estado: draft.estado, observaciones: draft.observaciones || null,
    }));
    if (!marcas.length) { setNotice({ type: "error", text: "No hay marcas nuevas para guardar." }); return; }
    setSaving(true); setNotice(null);
    try {
      const result = await api("/asistencias/lote", { method: "PUT", body: { fecha, marcas } });
      setPending({});
      await loadRoster();
      setSuccess({ title: "Asistencia guardada", message: result.actualizados > 0 ? `Se guardaron los cambios de ${result.actualizados} trabajador(es).` : "La información ya estaba actualizada." });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Mi tienda" title="Gestión de asistencia" subtitle="Marca el estado del día para cada trabajador." />
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="toolbar">
        <span>Fecha</span>
        <input type="date" value={fecha} max={todayISO()} onChange={(e) => onFechaChange(e.target.value)} />
        <span>Mostrar</span>
        <select value={mostrar} onChange={(e) => setMostrar(e.target.value)}>
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
          <option value="todos">Todos</option>
        </select>
        <span>{marcadosCount} de {empleados.length} marcados</span>
        <button className="button button--ghost button--small" style={{ marginLeft: "auto" }} onClick={loadRoster}>
          <RefreshCw size={14} />Actualizar
        </button>
      </div>
      <div className="toolbar toolbar--filters">
        <SearchInput
          value={search}
          onChange={setSearch}
          onKeyDown={onSearchKeyDown}
          placeholder="Buscar trabajador… (Enter marca Asistencia si queda solo uno)"
        />
      </div>

      {!roster ? <Loading /> : visibles.length ? (
        <div className="attendance-scroll">
          <div className="attendance-table">
            <div className="attendance-head">
              <span>Trabajador</span>
              {estados.map((e) => <span key={e.value}>{e.label}</span>)}
              <span>Observación</span>
            </div>
            {visibles.map((emp) => (
              <div className="attendance-row" key={emp.usuario_id}>
                <div className="person-cell">
                  <span className="avatar">{emp.nombre.charAt(0).toUpperCase()}</span>
                  <div><strong>{emp.nombre}</strong><small>{emp.dni}{emp.estado === "inactivo" ? " · Inactivo" : ""}</small></div>
                </div>
                {estados.map((e) => (
                  <button
                    key={e.value}
                    type="button"
                    className={`attendance-check attendance-check--${e.value} ${emp.registro?.estado === e.value ? "checked" : ""}`}
                    aria-label={`${e.label} para ${emp.nombre}`}
                    onClick={() => marcar(emp, e.value)}
                  >
                    {emp.registro?.estado === e.value && <Check size={13} />}
                  </button>
                ))}
                <input
                  className="attendance-obs"
                  maxLength={500}
                  disabled={!emp.registro}
                  placeholder={emp.registro ? "Observación (opcional)" : "Marca un estado primero"}
                  value={emp.registro?.observaciones || ""}
                  onChange={(event) => setObservacion(emp, event.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState icon={Users} title="Sin trabajadores" text="No hay trabajadores para mostrar con ese filtro." />
      )}

      <div className="form-actions">
        <button className="button button--primary" disabled={saving || !Object.keys(pending).length} onClick={guardarTodo}>
          {saving ? "Guardando…" : "Guardar asistencia"}
        </button>
      </div>

      <PageHeader eyebrow="Historial" title="Asistencia" subtitle="Consulta lo ya guardado y los cambios realizados." />
      <div className="segmented">
        <button className={tab === "registros" ? "active" : ""} onClick={() => setTab("registros")}>Registros de Asistencia</button>
        <button className={tab === "cambios" ? "active" : ""} onClick={() => setTab("cambios")}>Historial de Cambios</button>
      </div>
      {tab === "registros" ? <RegistrosPanel onDeleted={() => loadRoster()} /> : <CambiosPanel />}
      <SuccessDialog open={!!success} title={success?.title} message={success?.message} onContinue={() => setSuccess(null)} />
    </>
  );
}

function RegistrosPanel({ onDeleted }) {
  const [mes, setMes] = useState(todayISO().slice(0, 7));
  const [dia, setDia] = useState("");
  const [estadoUsuario, setEstadoUsuario] = useState("activo");
  const [orden, setOrden] = useState("desc");
  const [usuarioId, setUsuarioId] = useState("");
  const [historial, setHistorial] = useState(null);
  const [busyExport, setBusyExport] = useState(false);
  const [notice, setNotice] = useState(null);

  const desde = dia ? `${mes}-${dia}` : `${mes}-01`;
  const hasta = dia ? `${mes}-${dia}` : lastDayOfMonth(mes);

  const load = useCallback(() => {
    const params = new URLSearchParams({ desde, hasta, estado_usuario: estadoUsuario, orden });
    api(`/asistencias/historial?${params}`).then(setHistorial).catch((err) => setNotice({ type: "error", text: err.message }));
  }, [desde, hasta, estadoUsuario, orden]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setUsuarioId(""); }, [mes, dia, estadoUsuario]);

  const usuarioOptions = useMemo(() => {
    const map = new Map();
    for (const row of historial || []) map.set(row.usuario_id, row.nombre);
    return [...map.entries()];
  }, [historial]);
  const filtrado = (historial || []).filter((row) => !usuarioId || String(row.usuario_id) === usuarioId);

  const eliminar = async (row) => {
    if (!window.confirm(`¿Eliminar el registro de ${row.nombre} del ${formatDate(row.fecha)}?`)) return;
    setNotice(null);
    try {
      await api(`/asistencias/${row.id}`, { method: "DELETE" });
      await load();
      onDeleted?.();
      setNotice({ type: "success", text: "Registro eliminado." });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    }
  };

  const exportar = async () => {
    setBusyExport(true); setNotice(null);
    try {
      await downloadFile(`/api/asistencias/historial/export.xlsx?desde=${desde}&hasta=${hasta}`, "mi-tienda-asistencias.xlsx");
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setBusyExport(false);
    }
  };

  return (
    <>
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      <div className="toolbar toolbar--filters">
        <span>Usuario</span>
        <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
          <option value="">Todos</option>
          {usuarioOptions.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
        </select>
        <span>Mes</span>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        <span>Día</span>
        <select value={dia} onChange={(e) => setDia(e.target.value)}>
          <option value="">Todos</option>
          {Array.from({ length: daysInMonth(mes) }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <span>Estado</span>
        <select value={estadoUsuario} onChange={(e) => setEstadoUsuario(e.target.value)}>
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
          <option value="todos">Todos</option>
        </select>
        <select value={orden} onChange={(e) => setOrden(e.target.value)}>
          <option value="desc">Más recientes primero</option>
          <option value="asc">Más antiguos primero</option>
        </select>
        <button className="button button--ghost button--small" disabled={busyExport} onClick={exportar}>
          {busyExport ? "Generando…" : "Exportar"}
        </button>
      </div>

      {!historial ? <Loading /> : filtrado.length ? (
        <div className="table-panel">
          <div className="data-table data-table--asistencias-historial">
            <div className="data-table__head"><span>Fecha</span><span>Trabajador</span><span>Usuario</span><span>Estado</span><span>Observación</span><span /></div>
            {filtrado.map((row) => (
              <div className="data-table__row" key={row.id}>
                <span>{formatDate(row.fecha)}</span>
                <span className="cell-primary">{row.nombre}</span>
                <span>{row.usuario}</span>
                <span><StatusBadge value={row.estado} label={estadoAsistenciaLabels[row.estado]} /></span>
                <span>{row.observaciones || "—"}</span>
                <div className="row-actions">
                  <button className="danger" onClick={() => eliminar(row)} aria-label="Eliminar"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState icon={CalendarCheck2} title="Sin registros" text="No hay asistencias guardadas con esos filtros." />
      )}
    </>
  );
}

function CambiosPanel() {
  const [operacion, setOperacion] = useState("todas");
  const [desde, setDesde] = useState(`${todayISO().slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(todayISO());
  const [log, setLog] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ desde, hasta });
    if (operacion !== "todas") params.set("operacion", operacion);
    api(`/asistencias/log?${params}`).then(setLog).catch((err) => setNotice({ type: "error", text: err.message }));
  }, [operacion, desde, hasta]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      <div className="toolbar toolbar--filters">
        <span>Operación</span>
        <select value={operacion} onChange={(e) => setOperacion(e.target.value)}>
          <option value="todas">Todas</option>
          <option value="creacion">Creación</option>
          <option value="edicion">Edición</option>
          <option value="eliminacion">Eliminación</option>
        </select>
        <span>Desde</span>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <span>Hasta</span>
        <input type="date" value={hasta} max={todayISO()} onChange={(e) => setHasta(e.target.value)} />
      </div>

      {!log ? <Loading /> : log.length ? (
        <div className="table-panel">
          <div className="data-table data-table--log-asistencias">
            <div className="data-table__head"><span>Fecha y hora</span><span>Operación</span><span>Trabajador</span><span>Registrado por</span></div>
            {log.map((row) => (
              <div className="data-table__row" key={row.id}>
                <span>{formatDateTime(row.created_at)}</span>
                <span><StatusBadge value={row.operacion} label={operacionLabels[row.operacion]} /></span>
                <span className="cell-primary">{row.trabajador}</span>
                <span>{row.realizado_por || "—"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState icon={History} title="Sin movimientos" text="No hay cambios registrados con esos filtros." />
      )}
    </>
  );
}
