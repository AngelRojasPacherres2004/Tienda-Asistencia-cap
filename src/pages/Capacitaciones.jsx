import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, Clock3, GraduationCap,
} from "lucide-react";
import { api, formatDate } from "../lib/api";
import {
  EmptyState, Field, Loading, Modal, Notice, PageHeader, SearchInput, StatusBadge,
} from "../components/UI";

const roleLabels = { admin: "Administrador", jefe_tienda: "Jefe de tienda", empleado: "Empleado" };
const estadoPalette = { completado: "#2f9e78", en_curso: "#df9f39", pendiente: "#d9635f" };

function Metric({ icon: Icon, label, value, note, tone }) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__top"><span><Icon size={20} /></span><small>{label}</small></div>
      <strong>{value ?? 0}</strong><p>{note}</p>
    </article>
  );
}

export default function Capacitaciones() {
  const [trabajadores, setTrabajadores] = useState(null);
  const [showInactivos, setShowInactivos] = useState(false);
  const [perfilId, setPerfilId] = useState(null);
  const [cursos, setCursos] = useState(null);
  const [tab, setTab] = useState("resumen");
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

      {perfilId ? (
        <TrabajadorPerfilView id={perfilId} onBack={() => setPerfilId(null)} onSaved={loadTrabajadores} />
      ) : (
        <>
          <PageHeader eyebrow="Mi tienda" title="Capacitaciones por trabajador" subtitle="Selecciona a alguien para ver y editar su progreso." />
          <div className="toolbar">
            <span>{visibles.length} trabajadores</span>
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
                      <div><strong>{t.nombres} {t.apellidos}</strong></div>
                    </div>
                    <span>{t.usuario}</span>
                    <span className={`role role--${t.rol}`}>{roleLabels[t.rol]}</span>
                    <span><StatusBadge value={t.estado} /></span>
                  </div>
                ))}
              </div>
            </div>
          ) : <EmptyState icon={GraduationCap} title="Sin trabajadores" text="Tu tienda todavía no tiene personal registrado." />}
        </>
      )}

      <PageHeader eyebrow="Seguimiento" title="Capacitaciones" subtitle="Resumen de cumplimiento y asignación en lote." />
      <div className="segmented">
        <button className={tab === "resumen" ? "active" : ""} onClick={() => setTab("resumen")}>Resumen</button>
        <button className={tab === "asignar" ? "active" : ""} onClick={() => setTab("asignar")}>Asignar capacitación</button>
      </div>
      {!cursos ? <Loading /> : cursos.length ? (
        tab === "resumen"
          ? <ResumenPanel cursos={cursos} />
          : <AsignarPanel cursos={cursos} onAssigned={loadTrabajadores} />
      ) : (
        <EmptyState icon={GraduationCap} title="Sin cursos activos" text="Pide al administrador que dé de alta un curso en el catálogo." />
      )}
    </>
  );
}

function TrabajadorPerfilView({ id, onBack }) {
  const [data, setData] = useState(null);
  const [encargados, setEncargados] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [savingCurso, setSavingCurso] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => api(`/capacitaciones/trabajadores/${id}`).then((res) => {
    setData(res);
    const initial = {};
    for (const curso of res.cursos) {
      initial[curso.curso_id] = {
        estado: curso.estado, duracion_horas: curso.duracion_horas ?? "", encargado_id: curso.encargado_id ?? "",
      };
    }
    setDrafts(initial);
  }).catch((err) => setNotice({ type: "error", text: err.message })), [id]);

  useEffect(() => { load(); api("/encargados").then(setEncargados).catch(() => {}); }, [load]);

  const setDraft = (cursoId, field, value) => setDrafts((current) => ({ ...current, [cursoId]: { ...current[cursoId], [field]: value } }));

  const guardar = async (cursoId) => {
    const draft = drafts[cursoId];
    if (!draft.encargado_id) { setNotice({ type: "error", text: "Selecciona un encargado para guardar." }); return; }
    setSavingCurso(cursoId); setNotice(null);
    try {
      await api(`/capacitaciones/trabajadores/${id}/cursos/${cursoId}`, {
        method: "PUT",
        body: { estado: draft.estado, duracion_horas: draft.duracion_horas || null, encargado_id: Number(draft.encargado_id) },
      });
      await load();
      setNotice({ type: "success", text: "Progreso guardado." });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setSavingCurso(null);
    }
  };

  if (!data) return <Loading />;
  const { trabajador, resumen, cursos } = data;
  const porcentaje = resumen.total ? Math.round((resumen.completados / resumen.total) * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow="Capacitaciones por trabajador"
        title={`${trabajador.nombres} ${trabajador.apellidos}`}
        subtitle={`@${trabajador.usuario} · ${roleLabels[trabajador.rol]}`}
        action={<button className="button button--ghost" onClick={onBack}><ArrowLeft size={16} />Volver</button>}
      />
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      <section className="profile-hero">
        <span className="profile-avatar">{trabajador.nombres.charAt(0).toUpperCase()}</span>
        <div><StatusBadge value={trabajador.estado} /><h2>{resumen.completados} de {resumen.total}</h2><p>cursos completados</p></div>
        <div className="profile-completion"><strong>{porcentaje}%</strong><span>Completado</span></div>
      </section>
      <div className="progress-bar"><div className="progress-bar__fill" style={{ width: `${porcentaje}%` }} /></div>

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
                <div className="inline-fields">
                  <Field label="Duración (h)">
                    <input type="number" min="0" step="0.5" value={draft.duracion_horas ?? ""} onChange={(e) => setDraft(curso.curso_id, "duracion_horas", e.target.value)} />
                  </Field>
                  <Field label="Encargado">
                    <select value={draft.encargado_id ?? ""} onChange={(e) => setDraft(curso.curso_id, "encargado_id", e.target.value)}>
                      <option value="">Selecciona…</option>
                      {curso.encargado_id && !encargados.some((en) => en.id === curso.encargado_id) && (
                        <option value={curso.encargado_id}>{curso.encargado_nombre}</option>
                      )}
                      {encargados.filter((en) => en.activo).map((en) => <option key={en.id} value={en.id}>{en.nombre}</option>)}
                    </select>
                  </Field>
                </div>
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
        <EmptyState icon={GraduationCap} title="Sin cursos" text="Todavía no hay cursos en el catálogo." />
      )}
    </>
  );
}

function ResumenPanel({ cursos }) {
  const [cursoId, setCursoId] = useState(cursos[0]?.id ?? "");
  const [resumen, setResumen] = useState(null);
  const [modalGrupo, setModalGrupo] = useState(null);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!cursoId) return;
    setResumen(null);
    api(`/capacitaciones/resumen?curso_id=${cursoId}`).then(setResumen).catch((err) => setNotice({ type: "error", text: err.message }));
  }, [cursoId]);

  const filas = resumen ? [
    { key: "completado", nombre: "Hicieron la capacitación", cantidad: resumen.completados, icon: CheckCircle2 },
    { key: "en_curso", nombre: "En curso", cantidad: resumen.en_curso, icon: Clock3 },
    { key: "pendiente", nombre: "No hicieron la capacitación", cantidad: resumen.pendientes, icon: AlertTriangle },
  ] : [];
  const grupoLabels = { completado: "Hicieron la capacitación", en_curso: "En curso", pendiente: "No hicieron la capacitación" };
  const personas = modalGrupo && resumen
    ? resumen.grupos[modalGrupo].filter((p) => [p.nombre, p.usuario].join(" ").toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <>
      <div className="toolbar">
        <span>Curso</span>
        <select value={cursoId} onChange={(e) => setCursoId(e.target.value)}>
          {cursos.map((curso) => <option key={curso.id} value={curso.id}>{curso.nombre}</option>)}
        </select>
      </div>
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      {!resumen ? <Loading /> : (
        <>
          <section className="metrics-grid">
            <Metric icon={CheckCircle2} label="Hicieron la capacitación" value={resumen.completados} note="de tu equipo activo" tone="green" />
            <Metric icon={Clock3} label="En curso" value={resumen.en_curso} note="avanzando" tone="amber" />
            <Metric icon={GraduationCap} label="No la hicieron" value={resumen.pendientes} note="pendientes" tone="red" />
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
          <p className="form-note">Haz clic en una fila para ver el listado de trabajadores.</p>
        </>
      )}

      <Modal open={!!modalGrupo} wide title={`Trabajadores · ${grupoLabels[modalGrupo]}`} onClose={() => setModalGrupo(null)}>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o usuario…" />
        <div className="detail-people" style={{ marginTop: 12 }}>
          {personas.length ? personas.map((p) => (
            <div className="detail-person" key={p.usuario_id}>
              <span className="avatar">{p.nombre.charAt(0).toUpperCase()}</span>
              <div><strong>{p.nombre}</strong><small>@{p.usuario} · {roleLabels[p.rol]}</small></div>
              <div className="detail-person__status">
                <small>{p.duracion_horas ? `${p.duracion_horas} h` : "Sin duración"}</small>
                <small>{p.encargado_nombre || "Sin encargado"}</small>
                <small>{p.fecha_finalizacion ? formatDate(p.fecha_finalizacion) : "—"}</small>
              </div>
            </div>
          )) : <div className="panel-empty"><span>Nadie en este grupo.</span></div>}
        </div>
      </Modal>
    </>
  );
}

function AsignarPanel({ cursos, onAssigned }) {
  const [form, setForm] = useState({ curso_id: cursos[0]?.id ?? "", estado: "en_curso", encargado_id: "", duracion_horas: "" });
  const [encargados, setEncargados] = useState([]);
  const [trabajadores, setTrabajadores] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("activo");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => { api("/encargados").then(setEncargados).catch(() => {}); }, []);

  const loadTrabajadores = useCallback(() => {
    if (!form.curso_id) return;
    api(`/capacitaciones/trabajadores?curso_id=${form.curso_id}`).then(setTrabajadores).catch((err) => setNotice({ type: "error", text: err.message }));
  }, [form.curso_id]);
  useEffect(() => { loadTrabajadores(); setSelected(new Set()); }, [loadTrabajadores]);

  const permiteEstadoActual = (progresoEstado) => {
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
      setNotice({ type: "success", text: `${result.actualizados} trabajador(es) actualizados.` });
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
            <option value="pendiente">Pendiente</option>
            <option value="en_curso">En curso</option>
            <option value="completado">Completado</option>
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
              <div><strong>{t.nombres} {t.apellidos}</strong><small>@{t.usuario}</small></div>
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
    </>
  );
}
