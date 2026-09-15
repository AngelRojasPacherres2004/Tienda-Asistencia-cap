import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, BarChart3, CheckCircle2, Clock3, GraduationCap,
} from "lucide-react";
import { api, formatDate } from "../lib/api";
import {
  EmptyState, Field, Loading, Modal, Notice, PageHeader, SearchInput, StatusBadge, SuccessDialog,
} from "../components/UI";

const roleLabels = { gerencia_general: "Gerencia general", gerente_comercial: "Gerente comercial", coach: "Coach", jefe_zonal: "Jefe zonal", jefe_tienda: "Jefe de tienda", asistente_tienda: "Asistente de tienda", trabajador: "Trabajador", seguridad: "Seguridad" };
const estadoPalette = { completado: "#2f9e78", en_curso: "#df9f39", pendiente: "#d9635f" };
const progresoLabels = { completado: "Completado", en_curso: "En curso", pendiente: "Pendiente" };

function Metric({ icon: Icon, label, value, note, tone }) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__top"><span><Icon size={20} /></span><small>{label}</small></div>
      <strong>{value ?? 0}</strong><p>{note}</p>
    </article>
  );
}

export default function Capacitaciones({ user }) {
  const zonal = user?.rol === "jefe_zonal";
  const central = ["gerencia_general", "gerente_comercial", "coach"].includes(user?.rol);
  const supervisedLabels = {
    gerencia_general: "todo el personal operativo",
    gerente_comercial: "todo el personal operativo",
    coach: "gerentes comerciales",
    jefe_zonal: "jefes de tienda",
    jefe_tienda: "asistentes, trabajadores y seguridad",
    asistente_tienda: "trabajadores y seguridad",
  };
  const supervisedLabel = supervisedLabels[user?.rol] || "personas";
  const [trabajadores, setTrabajadores] = useState(null);
  const [showInactivos, setShowInactivos] = useState(false);
  const [perfilId, setPerfilId] = useState(null);
  const [cursos, setCursos] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadTrabajadores = () => api("/capacitaciones/trabajadores").then(setTrabajadores).catch((err) => setNotice({ type: "error", text: err.message }));
  useEffect(() => {
    loadTrabajadores();
    api("/cursos").then((data) => setCursos(data.filter((c) => c.activo))).catch((err) => setNotice({ type: "error", text: err.message }));
  }, []);

  const activos = (trabajadores || []).filter((t) => t.estado === "activo");
  const inactivos = (trabajadores || []).filter((t) => t.estado === "inactivo");
  const visibles = showInactivos ? (trabajadores || []) : activos;

  return (
    <>
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      <PageHeader eyebrow={central ? "Supervisión general" : zonal ? "Mi clúster" : "Mi tienda"} title="Capacitaciones por persona" subtitle={`Selecciona un nombre para revisar sus capacitaciones. Supervisas: ${supervisedLabel}.`} />
      <div className="toolbar">
        <span>{visibles.length} personas</span>
        <button className="button button--ghost button--small" style={{ marginLeft: "auto" }} onClick={() => setShowInactivos(!showInactivos)}>
          {showInactivos ? "Ocultar inactivos" : `Mostrar inactivos (${inactivos.length})`}
        </button>
      </div>
      {!trabajadores ? <Loading /> : visibles.length ? (
        <div className="table-panel">
          <div className="data-table data-table--trabajadores">
            <div className="data-table__head"><span>Nombre</span><span>Usuario</span><span>Rol</span><span>Activo</span></div>
            {visibles.map((t) => (
              <div className="data-table__row" key={t.id} onClick={() => setPerfilId(t.id)}>
                <div className="person-cell">
                  <span className="avatar">{t.nombres.charAt(0).toUpperCase()}</span>
                  <div><strong>{t.nombres} {t.apellidos}</strong><small>{t.tienda_nombre || ""}</small></div>
                </div>
                <span>{t.usuario}</span>
                <span className={`role role--${t.rol}`}>{roleLabels[t.rol]}</span>
                <span><StatusBadge value={t.estado} /></span>
              </div>
            ))}
          </div>
        </div>
      ) : <EmptyState icon={GraduationCap} title="Sin personas para supervisar" text={`Todavía no hay ${supervisedLabel} disponibles en tu alcance.`} />}

      {perfilId && <TrabajadorPerfilView id={perfilId} onClose={() => setPerfilId(null)} />}

      <PageHeader eyebrow="Seguimiento" title="Resumen de capacitaciones" subtitle="Filtra una capacitación y revisa el estado de las personas supervisadas." />
      {!cursos ? <Loading /> : cursos.length ? (
        <ResumenPanel cursos={cursos} />
      ) : (
        <EmptyState icon={GraduationCap} title="Sin capacitaciones activas" text="Pide al administrador que dé de alta una capacitación en el catálogo." />
      )}
    </>
  );
}

function TrabajadorPerfilView({ id, onClose }) {
  const [data, setData] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [savingCurso, setSavingCurso] = useState(null);
  const [notice, setNotice] = useState(null);
  const [success, setSuccess] = useState(null);

  const load = useCallback(() => api(`/capacitaciones/trabajadores/${id}`).then((res) => {
    setData(res);
    const initial = {};
    for (const curso of res.cursos) {
      initial[curso.curso_id] = {
        estado: curso.estado, duracion_horas: curso.duracion_horas ?? "",
      };
    }
    setDrafts(initial);
  }).catch((err) => setNotice({ type: "error", text: err.message })), [id]);

  useEffect(() => { load(); }, [load]);

  const setDraft = (cursoId, field, value) => setDrafts((current) => ({ ...current, [cursoId]: { ...current[cursoId], [field]: value } }));

  const guardar = async (cursoId) => {
    const draft = drafts[cursoId];
    setSavingCurso(cursoId); setNotice(null);
    try {
      await api(`/capacitaciones/trabajadores/${id}/cursos/${cursoId}`, {
        method: "PUT",
        body: { estado: draft.estado, duracion_horas: draft.duracion_horas || null },
      });
      await load();
      setSuccess({ title: "Progreso actualizado", message: "La capacitación del trabajador se guardó correctamente." });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setSavingCurso(null);
    }
  };

  if (!data) return <Modal open title="Capacitaciones" onClose={onClose} wide><Loading /></Modal>;
  const { trabajador, cursos } = data;

  return (
    <>
      <Modal
        open
        wide
        title={`${trabajador.nombres} ${trabajador.apellidos}`}
        subtitle={`@${trabajador.usuario} · ${roleLabels[trabajador.rol]}`}
        onClose={onClose}
      >
        {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
        {cursos.length ? (
          <div className="worker-task-grid">
            {cursos.map((curso) => {
              const draft = drafts[curso.curso_id] || {};
              return (
                <article className="worker-task" key={curso.curso_id}>
                  <div className="worker-task__top">
                    <span>{curso.competencia}</span>
                    {!curso.curso_activo && <span className="status status--inactivo"><i />Inactivo</span>}
                  </div>
                  <h3>{curso.titulo}</h3>
                  <Field label="Estado">
                    <select value={draft.estado || "pendiente"} onChange={(e) => setDraft(curso.curso_id, "estado", e.target.value)}>
                      <option value="pendiente">Pendiente</option>
                      <option value="en_curso">En curso</option>
                      <option value="completado">Completado</option>
                    </select>
                  </Field>
                  <Field label="Duración (h)">
                    <input type="number" min="0" step="0.5" value={draft.duracion_horas ?? ""} onChange={(e) => setDraft(curso.curso_id, "duracion_horas", e.target.value)} />
                  </Field>
                  <div className="worker-task__footer">
                    <button className="button button--primary button--small" disabled={savingCurso === curso.curso_id} onClick={() => guardar(curso.curso_id)}>
                      {savingCurso === curso.curso_id ? "Guardando…" : "Guardar"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={GraduationCap} title="Sin capacitaciones" text="Todavía no hay capacitaciones en el catálogo." />
        )}
      </Modal>
      <SuccessDialog open={!!success} title={success?.title} message={success?.message} onContinue={() => setSuccess(null)} />
    </>
  );
}

function ResumenPanel({ cursos }) {
  const [cursoId, setCursoId] = useState(cursos[0]?.id ?? "");
  const [resumen, setResumen] = useState(null);
  const [loadingResumen, setLoadingResumen] = useState(true);
  const [modalGrupo, setModalGrupo] = useState(null);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!cursoId) return;
    setLoadingResumen(true);
    setModalGrupo(null);
    api(`/capacitaciones/resumen?curso_id=${cursoId}`)
      .then(setResumen)
      .catch((err) => setNotice({ type: "error", text: err.message }))
      .finally(() => setLoadingResumen(false));
  }, [cursoId]);

  const filas = resumen ? [
    { key: "pendiente", nombre: "Pendiente", cantidad: resumen.pendientes, icon: AlertTriangle },
    { key: "en_curso", nombre: "En curso", cantidad: resumen.en_curso, icon: Clock3 },
    { key: "completado", nombre: "Completado", cantidad: resumen.completados, icon: CheckCircle2 },
  ] : [];
  const grupoLabels = { completado: "Completado", en_curso: "En curso", pendiente: "Pendiente" };
  const personas = modalGrupo && resumen
    ? resumen.grupos[modalGrupo].filter((p) => [p.nombre, p.usuario].join(" ").toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <>
      <div className="toolbar toolbar--course-filter">
        <label>
          <span>Capacitaciones</span>
          <select value={cursoId} onChange={(e) => setCursoId(e.target.value)} aria-label="Seleccionar capacitación">
            {cursos.map((curso) => <option key={curso.id} value={curso.id}>{curso.nombre}</option>)}
          </select>
        </label>
        {loadingResumen && resumen && <small>Actualizando…</small>}
      </div>
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      {!resumen ? <Loading /> : (
        <div style={{ opacity: loadingResumen ? 0.65 : 1, transition: "opacity .15s ease" }} aria-busy={loadingResumen}>
          <section className="metrics-grid">
            <Metric icon={AlertTriangle} label="Pendiente" value={resumen.pendientes} note="sin iniciar" tone="red" />
            <Metric icon={Clock3} label="En curso" value={resumen.en_curso} note="avanzando" tone="amber" />
            <Metric icon={CheckCircle2} label="Completado" value={resumen.completados} note="finalizadas" tone="green" />
            <Metric icon={BarChart3} label="% completado" value={`${resumen.porcentaje}%`} note={`${resumen.completados} de ${resumen.total}`} tone="violet" />
          </section>
          <div className="progress-rows">
            {filas.map((fila) => {
              const pct = resumen.total ? Math.round((fila.cantidad / resumen.total) * 100) : 0;
              return (
                <button type="button" className={`progress-row progress-row--${fila.key}`} key={fila.key} onClick={() => setModalGrupo(fila.key)}>
                  <span className={`progress-row__icon progress-row__icon--${fila.key}`}><fila.icon size={21} /></span>
                  <div className="progress-row__body">
                    <div className="progress-row__label"><strong>{fila.nombre}</strong></div>
                    <div className="progress-bar"><div className="progress-bar__fill" style={{ width: `${Math.max(pct, 3)}%`, background: estadoPalette[fila.key] }} /></div>
                  </div>
                  <div className="progress-row__stat">
                    <strong style={{ color: estadoPalette[fila.key] }}>{pct}%</strong>
                    <small>{fila.cantidad} de {resumen.total}</small>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="form-note">Haz clic en Pendiente, En curso o Completado para ver las personas de ese grupo.</p>
        </div>
      )}

      <Modal open={!!modalGrupo} wide title={`Personas · ${grupoLabels[modalGrupo]}`} onClose={() => setModalGrupo(null)}>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o usuario…" />
        <div className="detail-people" style={{ marginTop: 12 }}>
          {personas.length ? personas.map((p) => (
            <div className="detail-person" key={p.usuario_id}>
              <span className="avatar">{p.nombre.charAt(0).toUpperCase()}</span>
              <div><strong>{p.nombre}</strong><small>@{p.usuario} · {roleLabels[p.rol]}</small></div>
              <div className="detail-person__status">
                <small>{p.duracion_horas ? `${p.duracion_horas} h` : "Sin duración"}</small>
                <small>{p.fecha_finalizacion ? formatDate(p.fecha_finalizacion) : "—"}</small>
              </div>
            </div>
          )) : <div className="panel-empty"><span>Nadie en este grupo.</span></div>}
        </div>
      </Modal>
    </>
  );
}

export function AsignarPanel({ cursos, onAssigned, estadosPermitidos = ["pendiente", "en_curso", "completado"], restringirTransiciones = true }) {
  const estadoInicial = estadosPermitidos.includes("en_curso") ? "en_curso" : estadosPermitidos[0];
  const [form, setForm] = useState({ curso_id: cursos[0]?.id ?? "", estado: estadoInicial, encargado_id: "", duracion_horas: "" });
  const [encargados, setEncargados] = useState([]);
  const [trabajadores, setTrabajadores] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("activo");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => { api("/encargados").then(setEncargados).catch(() => {}); }, []);

  const loadTrabajadores = useCallback(() => {
    if (!form.curso_id) return;
    api(`/capacitaciones/trabajadores?curso_id=${form.curso_id}`).then(setTrabajadores).catch((err) => setNotice({ type: "error", text: err.message }));
  }, [form.curso_id]);
  useEffect(() => { loadTrabajadores(); setSelected(new Set()); }, [loadTrabajadores]);

  const permiteEstadoActual = (progresoEstado) => {
    if (!restringirTransiciones) return progresoEstado !== form.estado;
    if (form.estado === "en_curso") return progresoEstado === "pendiente";
    if (form.estado === "completado") return progresoEstado === "en_curso";
    return true;
  };

  const visibles = (trabajadores || [])
    .filter((t) => filtroEstado === "todos" || t.estado === filtroEstado)
    .filter((t) => permiteEstadoActual(t.progreso_estado))
    .filter((t) => [t.nombres, t.apellidos, t.usuario].join(" ").toLowerCase().includes(search.toLowerCase()));

  const toggle = (id) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const aplicar = async () => {
    if (!form.curso_id) { setNotice({ type: "error", text: "Selecciona una capacitación." }); return; }
    if (!form.encargado_id) { setNotice({ type: "error", text: "Selecciona un encargado." }); return; }
    if (!selected.size) { setNotice({ type: "error", text: "Selecciona al menos un trabajador." }); return; }
    setBusy(true); setNotice(null);
    try {
      const result = await api("/capacitaciones/asignar", {
        method: "PUT",
        body: {
          curso_id: Number(form.curso_id), estado: form.estado, encargado_id: Number(form.encargado_id),
          duracion_horas: form.duracion_horas || undefined, usuario_ids: [...selected],
        },
      });
      setSelected(new Set());
      await loadTrabajadores();
      onAssigned?.();
      setSuccess({ title: "Capacitación asignada", message: `Se actualizaron ${result.actualizados} trabajador(es) correctamente.` });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      <div className="form-grid">
        <Field label="Capacitación" className="span-2">
          <select value={form.curso_id} onChange={(e) => setForm({ ...form, curso_id: e.target.value })}>
            {cursos.map((curso) => <option key={curso.id} value={curso.id}>{curso.nombre}</option>)}
          </select>
        </Field>
        <Field label="Nuevo estado">
          <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
            {estadosPermitidos.includes("pendiente") && <option value="pendiente">Pendiente</option>}
            {estadosPermitidos.includes("en_curso") && <option value="en_curso">En curso</option>}
            {estadosPermitidos.includes("completado") && <option value="completado">Completado</option>}
          </select>
        </Field>
        <Field label="Encargado">
          <select value={form.encargado_id} onChange={(e) => setForm({ ...form, encargado_id: e.target.value })}>
            <option value="">Selecciona…</option>
            {encargados.filter((en) => en.activo).map((en) => <option key={en.id} value={en.id}>{en.nombre}</option>)}
          </select>
        </Field>
        <Field label="Duración (h)" hint="Opcional">
          <input type="number" min="0" step="0.5" value={form.duracion_horas} onChange={(e) => setForm({ ...form, duracion_horas: e.target.value })} />
        </Field>
      </div>

      <div className="toolbar toolbar--filters">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o usuario…" />
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
          <option value="todos">Todos</option>
        </select>
        <button className="button button--ghost button--small" onClick={() => setSelected(new Set(visibles.map((t) => t.id)))}>Seleccionar visibles</button>
        <button className="button button--ghost button--small" onClick={() => setSelected(new Set())}>Quitar selección</button>
      </div>

      {!trabajadores ? <Loading /> : visibles.length ? (
        <div className="people-picker" style={{ gridTemplateColumns: "1fr 1fr", maxHeight: 360 }}>
          {visibles.map((t) => (
            <button type="button" key={t.id} className={selected.has(t.id) ? "selected" : ""} onClick={() => toggle(t.id)}>
              <span>{t.nombres.charAt(0).toUpperCase()}</span>
              <div><strong>{t.nombres} {t.apellidos}</strong><small>@{t.usuario} · {t.tienda_nombre || "Sin tienda"} · {progresoLabels[t.progreso_estado] || "Pendiente"}</small></div>
              <i />
            </button>
          ))}
        </div>
      ) : (
        <EmptyState icon={GraduationCap} title="Nadie para mover a ese estado" text="Cambia el filtro, la búsqueda o el estado destino." />
      )}

      <div className="form-actions">
        <span style={{ marginRight: "auto", alignSelf: "center", fontSize: 11, color: "#8b96a5" }}>{selected.size} seleccionados</span>
        <button className="button button--primary" disabled={busy} onClick={aplicar}>{busy ? "Aplicando…" : "Aplicar a seleccionados"}</button>
      </div>
      <SuccessDialog open={!!success} title={success?.title} message={success?.message} onContinue={() => setSuccess(null)} />
    </>
  );
}
