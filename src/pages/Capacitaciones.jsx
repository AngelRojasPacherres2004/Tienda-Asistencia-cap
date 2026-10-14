import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, BarChart3, CheckCircle2, Clock3, GraduationCap, Filter, X,
} from "lucide-react";
import { api, formatDate } from "../lib/api";
import {
  EmptyState, Field, Loading, Modal, Notice, PageHeader, Pagination, SearchInput, StatusBadge, SuccessDialog,
} from "../components/UI";
import Reportes from "./Reportes";
import { clusterLabel } from "../lib/clusters";

const roleLabels = { gerencia_general: "Gerencia general", gerente_comercial: "Gerente comercial", coach: "Coach", jefe_zonal: "Jefe zonal", jefe_tienda: "Jefe de tienda", asistente_tienda: "Asistente de tienda", jefe_seguridad: "Jefe de seguridad", jefe_area: "Jefe de área", seguridad: "Seguridad", caja: "Caja", almacenero: "Almacenero", vendedor: "Vendedor", asistente: "Asistente", trabajador: "Trabajador" };
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
  const isCoach = user?.rol === "coach";
  const commercial = user?.rol === "gerente_comercial";
  const scopedAccess = commercial || isCoach;
  const [filterOpen, setFilterOpen] = useState(false);
  const [scope, setScope] = useState(isCoach ? "todos" : "zonales");
  const [scopeId, setScopeId] = useState("");
  const [coachStoreId, setCoachStoreId] = useState("");
  const [coachRole, setCoachRole] = useState("");
  const [coachPeople, setCoachPeople] = useState([]);
  const [personSearch, setPersonSearch] = useState("");
  const [stores, setStores] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [zonales, setZonales] = useState([]);
  const [administradores, setAdministradores] = useState([]);
  const scopeQuery = isCoach
    ? new URLSearchParams({ alcance: "todos", ...(coachStoreId ? { tienda_id: coachStoreId } : {}), ...(coachRole ? { rol: coachRole } : {}) }).toString()
    : scopedAccess ? new URLSearchParams({ ...(scopeId ? scope === "tiendas" ? { tienda_id: scopeId } : scope === "administradores" ? { administrador_id: scopeId } : { zonal_id: scopeId } : {}) }).toString() : "";
  const zonal = user?.rol === "jefe_zonal";
  const central = ["gerencia_general", "gerente_comercial", "coach"].includes(user?.rol);
  const supervisedLabels = {
    gerencia_general: "jefes zonales",
    gerente_comercial: "jefes zonales",
    coach: "todo el personal, por rol y por tienda",
    jefe_zonal: "jefes de tienda",
    jefe_tienda: "asistentes, trabajadores y seguridad",
    asistente_tienda: "trabajadores y seguridad",
  };
  const supervisedLabel = scopedAccess && scope === "tiendas" ? stores.find(store => String(store.id) === scopeId)?.nombre || "personal de tienda" : supervisedLabels[user?.rol] || "personas";
  const [trabajadores, setTrabajadores] = useState(null);
  const [showInactivos, setShowInactivos] = useState(false);
  const [perfilId, setPerfilId] = useState(null);
  const [cursos, setCursos] = useState(null);
  const [cursoId, setCursoId] = useState("");
  const [notice, setNotice] = useState(null);
  const [view,setView]=useState("seguimiento");
  const [page,setPage]=useState(1);

  useEffect(() => {
    api("/cursos").then((data) => {
      const activos = data.filter((c) => c.activo);
      setCursos(activos);
      setCursoId(activos[0]?.id ?? "");
    }).catch((err) => setNotice({ type: "error", text: err.message }));
  }, []);
  useEffect(() => {
    if (!scopedAccess) return;
    let active = true;
    const catalogs = isCoach ? api("/capacitaciones/alcances").then(data => [data.tiendas, data.clusters]) : Promise.all([api("/tiendas"), api("/clusters")]);
    Promise.all([catalogs, api("/capacitaciones/trabajadores")]).then(([[storeRows, clusterRows], leaders]) => {
      if (!active) return;
      setStores((isCoach ? storeRows : storeRows.filter(store => store.estado === "activo")).sort((a,b) => a.nombre.localeCompare(b.nombre,"es"))); setClusters(clusterRows); setZonales(leaders.filter(person => person.rol === "jefe_zonal")); setAdministradores(leaders.filter(person => person.rol === "jefe_tienda")); if (isCoach) setCoachPeople(leaders);
    }).catch(err => { if (active) setNotice({ type: "error", text: err.message }); });
    return () => { active = false; };
  }, [scopedAccess, isCoach]);
  useEffect(() => {
    let active = true;
    setTrabajadores(null); setPerfilId(null); setPage(1);
    if (scopedAccess && scope === "tiendas" && !scopeId) { setTrabajadores([]); return undefined; }
    api(`/capacitaciones/trabajadores?${scopeQuery}`).then(rows => { if (active) setTrabajadores(rows); }).catch(err => { if (active) { setTrabajadores([]); setNotice({ type: "error", text: err.message }); } });
    return () => { active = false; };
  }, [scopeQuery, scopedAccess, scope, scopeId]);
  const zonalCluster = id => clusters.filter(cluster => Number(cluster.jefe_zonal_id) === Number(id)).map(cluster => clusterLabel(cluster.codigo || cluster.nombre)).join(", ") || "Sin clúster asignado";
  const selectedScopePerson = (scope === "administradores" ? administradores : zonales).find(person => String(person.id) === scopeId);
  const scopeLabel = isCoach ? [stores.find(store => String(store.id) === coachStoreId)?.nombre, roleLabels[coachRole]].filter(Boolean).join(" · ") || "Todo el personal" : scope === "tiendas" ? stores.find(store => String(store.id) === scopeId)?.nombre || "Selecciona una tienda" : scope === "todos" ? "Todo el personal" : selectedScopePerson ? `${selectedScopePerson.nombres} ${selectedScopePerson.apellidos} · ${scope === "administradores" ? selectedScopePerson.tienda_nombre || "Sin tienda asignada" : zonalCluster(scopeId)}` : scope === "administradores" ? "Todos los administradores" : "Todos los jefes zonales";
  const coachRoles = [...new Set(coachPeople.filter(person => !coachStoreId || String(person.tienda_id) === coachStoreId).map(person => person.rol).filter(Boolean))].sort((a, b) => (roleLabels[a] || a).localeCompare(roleLabels[b] || b, "es"));

  const activos = (trabajadores || []).filter((t) => t.estado === "activo");
  const inactivos = (trabajadores || []).filter((t) => t.estado === "inactivo");
  const baseVisibles = showInactivos ? (trabajadores || []) : activos;
  const visibles = isCoach ? baseVisibles.filter(person => [person.nombres, person.apellidos, person.usuario].join(" ").toLocaleLowerCase("es").includes(personSearch.trim().toLocaleLowerCase("es"))) : baseVisibles;
  const pages=Math.max(1,Math.ceil(visibles.length/8));
  const visiblePeople=visibles.slice((page-1)*8,page*8);
  useEffect(()=>setPage(1),[showInactivos, personSearch]);

  return (
    <>
      {isCoach && <section className="coach-training-filters" aria-label="Filtros de asignación y seguimiento">
        <label className="field"><span>Tienda</span><select value={coachStoreId} onChange={event => { const nextStore = event.target.value; setCoachStoreId(nextStore); if (coachRole && !coachPeople.some(person => person.rol === coachRole && (!nextStore || String(person.tienda_id) === nextStore))) setCoachRole(""); }}><option value="">Todas las tiendas</option>{stores.map(store => <option key={store.id} value={store.id}>{store.nombre}{store.estado === "inactivo" ? " · Inactiva" : ""}</option>)}</select></label>
        <label className="field"><span>Rol</span><select value={coachRole} onChange={event => setCoachRole(event.target.value)}><option value="">Todos los roles</option>{coachRoles.map(role => <option key={role} value={role}>{roleLabels[role] || role}</option>)}</select></label>
        <button type="button" className="button button--ghost button--small" disabled={!coachStoreId && !coachRole} onClick={() => { setCoachStoreId(""); setCoachRole(""); }}>Limpiar filtros</button>
      </section>}
      {scopedAccess && !isCoach && <div className="commercial-dashboard">
        <button type="button" className={`dashboard-filter-fab ${filterOpen ? "open" : ""}`} aria-expanded={filterOpen} aria-controls="training-scope-filters" onClick={() => setFilterOpen(open => !open)}><Filter size={17}/><span>{filterOpen ? "Ocultar" : "Filtros"}</span></button>
        {filterOpen && <aside id="training-scope-filters" className="dashboard-filter-popover" aria-label="Filtros de capacitaciones"><div className="dashboard-filter-popover__head"><div><span className="eyebrow">Capacitaciones</span><h2>Personas y tiendas</h2></div><button type="button" className="icon-button" aria-label="Cerrar filtros" onClick={() => setFilterOpen(false)}><X size={17}/></button></div>
          <label className="field"><span>Consultar</span><select aria-label="Consultar" value={scope} onChange={event => { setScope(event.target.value); setScopeId(""); }}>{isCoach && <option value="todos">Todo el personal</option>}<option value="zonales">Jefes zonales</option>{isCoach && <option value="administradores">Administradores</option>}<option value="tiendas">Personal de tienda</option></select></label>
          {scope !== "todos" && <label className="field"><span>{scope === "tiendas" ? "Tienda" : scope === "administradores" ? "Administrador y tienda" : "Jefe zonal y clúster"}</span><select aria-label={scope === "tiendas" ? "Tienda" : scope === "administradores" ? "Administrador y tienda" : "Jefe zonal y clúster"} value={scopeId} onChange={event => setScopeId(event.target.value)}><option value="">{scope === "tiendas" ? "Selecciona una tienda" : scope === "administradores" ? "Todos los administradores" : "Todos los zonales"}</option>{scope === "tiendas" ? stores.map(store => <option key={store.id} value={store.id}>{store.nombre}{store.estado === "inactivo" ? " · Inactiva" : ""}</option>) : (scope === "administradores" ? administradores : zonales).map(person => <option key={person.id} value={person.id}>{person.nombres} {person.apellidos} · {scope === "administradores" ? person.tienda_nombre || "Sin tienda" : zonalCluster(person.id)}{person.estado === "inactivo" ? " · Inactivo" : ""}</option>)}</select></label>}
        </aside>}
      </div>}
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      {zonal && <><PageHeader eyebrow="Jefe zonal" title="Capacitaciones" subtitle="Consulta el avance por persona o prepara el reporte de capacitación con los mismos filtros de tu zona."/><div className="module-view-tabs"><button className={view==="seguimiento"?"active":""} onClick={()=>setView("seguimiento")}>Personas y avance</button><button className={view==="reporte"?"active":""} onClick={()=>setView("reporte")}>Reporte y exportación</button></div></>}

      {zonal && view === "reporte" ? <Reportes user={user} embedded initialKind="capacitaciones" allowedKinds={["capacitaciones"]}/> : <>

      {!zonal && <PageHeader eyebrow={central ? "Supervisión general" : "Mi tienda"} title="Capacitaciones por persona" subtitle={`Selecciona un nombre para revisar sus capacitaciones. Supervisas: ${supervisedLabel}.`} />}{zonal && <div className="module-section-heading"><span className="eyebrow">Seguimiento por persona</span><h2>Administradores supervisados</h2><p>Selecciona un administrador para consultar el avance de sus capacitaciones.</p></div>}
      <div className={`toolbar${isCoach ? " coach-training-people-toolbar" : ""}`}>
        <span>{visibles.length} personas</span>
        {isCoach && <SearchInput value={personSearch} onChange={setPersonSearch} placeholder="Buscar persona o usuario…" aria-label="Buscar persona o usuario" />}
        <button className="button button--ghost button--small" style={isCoach ? undefined : { marginLeft: "auto" }} onClick={() => setShowInactivos(!showInactivos)}>
          {showInactivos ? "Ocultar inactivos" : `Mostrar inactivos (${inactivos.length})`}
        </button>
      </div>
      {!trabajadores ? <Loading /> : visibles.length ? (
        <div className="table-panel">
          <div className="data-table data-table--trabajadores">
            <div className="data-table__head"><span>Nombre</span><span>Usuario</span><span>Rol</span><span>Activo</span></div>
            {visiblePeople.map((t) => (
              <div className="data-table__row" key={t.id} onClick={() => setPerfilId(t.id)}>
                <div className="person-cell">
                  <span className="avatar">{t.nombres.charAt(0).toUpperCase()}</span>
                  <div><strong>{t.nombres} {t.apellidos}</strong><small>{scopedAccess && t.rol === "jefe_zonal" ? zonalCluster(t.id) : t.tienda_nombre || ""}</small></div>
                </div>
                <span>{t.usuario}</span>
                <span className={`role role--${t.rol}`}>{roleLabels[t.rol]}</span>
                <span><StatusBadge value={t.estado} /></span>
              </div>
            ))}
          </div>
          <Pagination page={page} pages={pages} onChange={setPage}/>
        </div>
      ) : <EmptyState icon={GraduationCap} title="Sin personas para supervisar" text={`Todavía no hay ${supervisedLabel} disponibles en tu alcance.`} />}

      {perfilId && <TrabajadorPerfilView id={perfilId} readOnly={["gerencia_general", "gerente_comercial", "jefe_zonal", "coach"].includes(user?.rol)} onClose={() => setPerfilId(null)} />}

      {zonal ? <div className="module-section-heading"><span className="eyebrow">Resumen</span><h2>Avance de capacitaciones</h2><p>Filtra una capacitación y revisa el estado de los administradores supervisados.</p></div> : <PageHeader eyebrow={isCoach ? "Seguimiento general" : "Seguimiento"} title={isCoach ? "Capacitaciones asignadas por rol" : "Resumen de capacitaciones"} subtitle={isCoach ? "Las capacitaciones se habilitan para roles completos desde Crear capacitaciones; aquí solo revisas su avance general." : "Filtra una capacitación y revisa el estado de las personas supervisadas."} />}
      {!cursos ? <Loading /> : cursos.length ? (
        <>{scopedAccess && scope === "tiendas" && !scopeId ? <p>Selecciona una tienda en el filtro para revisar sus capacitaciones.</p> : <><ResumenPanel cursos={cursos} cursoId={cursoId} setCursoId={setCursoId} scopeQuery={scopeQuery} scopeLabel={scopedAccess ? scopeLabel : ""}/>{isCoach && <CoachComparisonPanel cursos={cursos} cursoId={cursoId} setCursoId={setCursoId} scopeQuery={scopeQuery}/>}</>}</>
      ) : (
        <EmptyState icon={GraduationCap} title="Sin capacitaciones activas" text="Pide al administrador que dé de alta una capacitación en el catálogo." />
      )}
      </>}
    </>
  );
}

function CoachComparisonPanel({ cursos, cursoId, setCursoId, scopeQuery = "" }) {
  const [people, setPeople] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setPeople(null); setError("");
    if (!cursoId) { setPeople([]); return undefined; }
    api(`/capacitaciones/trabajadores?curso_id=${cursoId}&estado=activo&${scopeQuery}`).then(rows => { if (active) setPeople(rows); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [cursoId, scopeQuery]);
  const summarize = (keyOf) => [...(people || []).reduce((map, person) => {
    const key = keyOf(person) || "Sin asignar";
    const row = map.get(key) || { name: key, total: 0, completado: 0, en_curso: 0, pendiente: 0 };
    row.total += 1; row[person.progreso_estado || "pendiente"] += 1; map.set(key, row); return map;
  }, new Map()).values()].sort((a, b) => (b.completado / b.total) - (a.completado / a.total));
  const groups = [{ title: "Comparativa entre tiendas", rows: summarize((p) => p.tienda_nombre) }, { title: "Progreso por rol", rows: summarize((p) => roleLabels[p.rol] || p.rol) }];
  return <section className="panel" style={{ marginTop: 24 }}><header className="panel__header"><div><span className="eyebrow">Comparativas</span><h2>Avance de capacitaciones</h2><p>Detecta qué tiendas y roles completaron la capacitación y cuáles requieren seguimiento.</p></div><select value={cursoId} onChange={(e) => setCursoId(e.target.value)}>{cursos.map((curso) => <option key={curso.id} value={curso.id}>{curso.nombre}</option>)}</select></header>{error ? <Notice type="error">{error}</Notice> : !people ? <Loading /> : <div className="training-comparison-grid">{groups.map((group) => <div key={group.title}><h3>{group.title}</h3>{group.rows.map((row) => { const pct = row.total ? Math.round(row.completado * 100 / row.total) : 0; return <article className="training-comparison-row" key={row.name}><div><strong>{row.name}</strong><small>{row.completado} completadas · {row.en_curso} en curso · {row.pendiente} pendientes</small></div><div className="progress-bar"><div className="progress-bar__fill" style={{ width: `${pct}%`, background: estadoPalette.completado }} /></div><b>{pct}%</b></article>; })}</div>)}</div>}</section>;
}

function TrabajadorPerfilView({ id, onClose, readOnly = false }) {
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
        estado: curso.estado, duracion_horas: curso.duracion_horas ?? "", nota: curso.nota ?? "", resultado: curso.resultado ?? "na",
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
        body: { estado: draft.estado, duracion_horas: draft.duracion_horas || null, nota: draft.nota === "" ? null : draft.nota, resultado: draft.resultado || "na" },
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
                  {readOnly ? <>
                    <Field label="Estado"><StatusBadge value={draft.estado || "pendiente"} label={progresoLabels[draft.estado || "pendiente"]} /></Field>
                    <Field label="Duración"><span>{draft.duracion_horas ? `${draft.duracion_horas} h` : "Sin registrar"}</span></Field>
                    <Field label="Nota"><span>{draft.nota !== "" && draft.nota != null ? `${draft.nota} / 20` : "Sin nota"}</span></Field>
                  </> : <>
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
                    <Field label="Nota (0–20)">
                      <input type="number" min="0" max="20" step="0.5" value={draft.nota ?? ""} onChange={(e) => setDraft(curso.curso_id, "nota", e.target.value)} />
                    </Field>
                    <Field label="Resultado"><select value={draft.resultado || "na"} onChange={(e) => setDraft(curso.curso_id, "resultado", e.target.value)}><option value="aprobado">Aprobado</option><option value="desaprobado">Desaprobado</option><option value="na">N/A</option></select></Field>
                    <div className="worker-task__footer">
                      <button className="button button--primary button--small" disabled={savingCurso === curso.curso_id} onClick={() => guardar(curso.curso_id)}>
                        {savingCurso === curso.curso_id ? "Guardando…" : "Guardar"}
                      </button>
                    </div>
                  </>}
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

function ResumenPanel({ cursos, cursoId, setCursoId, scopeQuery = "", scopeLabel = "" }) {
  const [resumen, setResumen] = useState(null);
  const [loadingResumen, setLoadingResumen] = useState(true);
  const [modalGrupo, setModalGrupo] = useState(null);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!cursoId) return;
    setLoadingResumen(true);
    setNotice(null);
    setResumen(null);
    setModalGrupo(null);
    let active = true;
    api(`/capacitaciones/resumen?curso_id=${cursoId}&${scopeQuery}`)
      .then(rows => { if (active) setResumen(rows); })
      .catch((err) => { if (active) setNotice({ type: "error", text: err.message }); })
      .finally(() => { if (active) setLoadingResumen(false); });
    return () => { active = false; };
  }, [cursoId, scopeQuery]);

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
      {scopeLabel && <p className="form-note"><strong>{scopeLabel}</strong> · Personal activo con esta capacitación asignada a su cargo. Sin progreso registrado: pendiente.</p>}
      {!resumen ? !notice && <Loading /> : (
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
                <button type="button" className={`progress-row progress-row--${fila.key}`} key={fila.key} onClick={() => { setSearch(""); setModalGrupo(fila.key); }}>
                  <span className={`progress-row__icon progress-row__icon--${fila.key}`}><fila.icon size={21} /></span>
                  <div className="progress-row__body">
                    <div className="progress-row__label"><strong>{fila.nombre}</strong></div>
                    <div className="progress-bar"><div className="progress-bar__fill" style={{ width: `${resumen.total ? fila.cantidad / resumen.total * 100 : 0}%`, background: estadoPalette[fila.key] }} /></div>
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
                <small>{p.duracion_horas ? `${p.duracion_horas} h` : "Sin duración"}{p.nota !== null && p.nota !== undefined ? ` · Nota ${p.nota}/20` : " · Sin nota"}</small>
                <small>{p.fecha_finalizacion ? formatDate(p.fecha_finalizacion) : "—"}</small>
              </div>
            </div>
          )) : <div className="panel-empty"><span>{search ? "No hay personas que coincidan con la búsqueda." : "Nadie en este grupo."}</span></div>}
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
  const [filtroRol, setFiltroRol] = useState("todos");
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
    .filter((t) => filtroRol === "todos" || t.rol === filtroRol)
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
        <select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)} aria-label="Filtrar personal por rol"><option value="todos">Todos los roles</option>{[...new Set((trabajadores || []).map((t) => t.rol))].sort().map((role) => <option key={role} value={role}>{roleLabels[role] || role}</option>)}</select>
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
