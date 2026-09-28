import { useEffect, useMemo, useState } from "react";
import { Building2, Crown, FileSpreadsheet, Info, Pencil, UsersRound } from "lucide-react";
import { api } from "../lib/api";
import {
  EmptyState, Field, Loading, Modal, Notice, PageHeader, Pagination, SearchInput, StatusBadge, SuccessDialog,
} from "../components/UI";
import Reportes from "./Reportes";

const blank = {
  nombre: "", codigo: "", direccion: "", distrito: "", provincia: "", departamento: "", zona: "",
  formato: "", fecha_apertura: "", fecha_cierre: "", metraje_m2: "",
  capacidad_stock_unid: "", cant_colaboradores_normal: "", colaboradores_camp: "", alquiler_mensual: "",
  jefe_id: "", cluster_id: "", estado: "activo",
};
const roleLabels = { jefe_tienda: "Administrador", asistente_tienda: "Asistente de tienda", jefe_seguridad: "Jefe de seguridad", jefe_area: "Jefe de área", seguridad: "Seguridad", caja: "Caja", almacenero: "Almacenero", vendedor: "Vendedor", asistente: "Asistente", trabajador: "Trabajador" };

export default function Tiendas({ user }) {
  const canEdit = ["gerente_comercial","jefe_zonal"].includes(user?.rol);
  const isZonal = user?.rol === "jefe_zonal";
  const [items, setItems] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [catalogs, setCatalogs] = useState({ ubicaciones: [], formatos: ["PROPIA", "METRO"] });
  const [zonalCluster, setZonalCluster] = useState(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [detailView,setDetailView]=useState("informacion");
  const [storeUsers, setStoreUsers] = useState(null);
  const [page,setPage]=useState(1);
  const [teamPage,setTeamPage]=useState(1);
  const [teamRole,setTeamRole]=useState("todos");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(null);

  const load = () => api("/tiendas").then(setItems).catch((err) => setNotice({ type: "error", text: err.message }));
  const loadUsuarios = () => api("/usuarios").then(setUsuarios).catch(() => {});
  useEffect(() => { load(); loadUsuarios(); api("/tiendas/catalogos").then(setCatalogs).catch(() => {}); if (user?.rol === "gerente_comercial") api("/clusters").then(setClusters).catch(() => {}); if(isZonal)api("/zonal/cluster").then(setZonalCluster).catch(()=>setZonalCluster(null)); }, [user?.rol,isZonal]);

  const filtered = useMemo(() => (items || []).filter((item) =>
    [item.nombre, item.direccion, item.jefe_nombre].join(" ").toLowerCase().includes(search.toLowerCase()),
  ), [items, search]);
  const pages=Math.max(1,Math.ceil(filtered.length/6));
  const visibleItems=filtered.slice((page-1)*6,page*6);
  useEffect(()=>setPage(1),[search]);

  const jefeOptions = usuarios.filter((u) => u.estado === "activo" && u.rol === "jefe_tienda");
  const departments = [...new Set(catalogs.ubicaciones.map((item) => item.departamento))];
  const provinces = [...new Set(catalogs.ubicaciones.filter((item) => item.departamento === editing?.departamento).map((item) => item.provincia))];
  const districts = [...new Set(catalogs.ubicaciones.filter((item) => item.departamento === editing?.departamento && item.provincia === editing?.provincia).map((item) => item.distrito))];

  const openStore = (item, tab = "informacion") => {
    setViewing(item);
    setDetailView(tab); setTeamPage(1); setTeamRole("todos");
    setStoreUsers(null);
    api(`/tiendas/${item.id}/usuarios`).then(setStoreUsers).catch((err) => setNotice({ type: "error", text: err.message }));
  };
  const closeEditor = () => { setEditing(null); setFormError(""); };
  const openNew = () => { setFormError(""); setEditing({ ...blank }); };
  const openEdit = (item) => {
    const formato = String(item.formato || "").toUpperCase();
    setFormError("");
    setEditing({
      ...item,
      departamento: String(item.departamento || "").toUpperCase(),
      provincia: String(item.provincia || "").toUpperCase(),
      distrito: String(item.distrito || "").toUpperCase(),
      zona: String(item.zona || "").toUpperCase(),
      formato: ["PROPIA", "METRO"].includes(formato) ? formato : "",
      jefe_id: item.jefe_id || "",
    });
  };
  const set = (field, value) => setEditing((current) => ({ ...current, [field]: value }));

  const save = async (event) => {
    event.preventDefault();
    setBusy(true); setFormError("");
    try {
      const numericFields = ["metraje_m2", "capacidad_stock_unid", "cant_colaboradores_normal", "colaboradores_camp", "alquiler_mensual"];
      const payload = { ...editing, jefe_id: editing.jefe_id ? Number(editing.jefe_id) : null, cluster_id: editing.cluster_id ? Number(editing.cluster_id) : null };
      delete payload.tipo_ubicacion;
      numericFields.forEach((field) => { payload[field] = editing[field] === "" || editing[field] == null ? null : Number(editing[field]); });
      await api(editing.id ? `/tiendas/${editing.id}` : "/tiendas", {
        method: editing.id ? "PUT" : "POST", body: payload,
      });
      closeEditor();
      await Promise.all([load(), loadUsuarios()]);
      setSuccess({ title: editing.id ? "Tienda actualizada" : "Tienda creada", message: editing.id ? "Los cambios de la tienda se guardaron correctamente." : "La nueva tienda fue registrada correctamente." });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const teamMembers = storeUsers || [];
  const filteredTeam = teamMembers.filter((item) => teamRole === "todos" || item.rol === teamRole);
  const teamRoles = [...new Set(teamMembers.map((item) => item.rol))].sort();
  useEffect(() => setTeamPage(1), [teamRole]);

  return (
    <>
      <PageHeader
        eyebrow={isZonal ? "Gestión zonal" : "Operación"}
        title={isZonal ? "Mis tiendas" : "Tiendas"}
        subtitle={isZonal ? "Administra las tiendas de tu zona sin depender del estado de su administrador." : "Crea tiendas, asigna su administrador y consulta al resto del personal."}
        action={canEdit ? <button className="button button--primary" onClick={openNew}>Nueva tienda</button> : null}
      />
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar tienda, dirección o jefe…" />
        <span>{filtered.length} tiendas</span>
      </div>

      {!items ? <Loading /> : filtered.length ? (
        <div className="company-grid">
          {visibleItems.map((item) => (
            <article className="company-card" key={item.id}>
              <div className="company-card__head">
                <span className="company-logo">{item.nombre.slice(0, 2).toUpperCase()}</span>
                <StatusBadge value={item.estado} />
              </div>
              <h3>{item.nombre}</h3>
              <p>{item.direccion || "Sin dirección registrada"}</p>
              <dl>
                <div><dt>Clúster</dt><dd>{item.cluster_nombre || "Sin asignar"}</dd></div>
                <div><dt>Jefe de tienda</dt><dd>{item.jefe_nombre || "Sin asignar"}</dd></div>
                <div><dt>Creada</dt><dd>{new Date(item.fecha_creacion).toLocaleDateString("es-PE")}</dd></div>
              </dl>
              <div className="company-card__footer">
                <button onClick={() => openStore(item, "informacion")}><Info size={14} />Información</button>
                <button onClick={() => openStore(item, "equipo")}><UsersRound size={14} />Equipo</button>
                <button onClick={() => openStore(item, "reportes")}><FileSpreadsheet size={14} />Reportes</button>
                {canEdit && <button onClick={() => openEdit(item)}><Pencil size={14} />Editar</button>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={Building2} title="Sin tiendas" text="Aún no hay tiendas registradas con ese criterio de búsqueda." />
      )}
      {filtered.length > 0 && <Pagination page={page} pages={pages} onChange={setPage}/>}

      <Modal
        open={!!editing}
        extraWide
        title={editing?.id ? "Editar tienda" : "Nueva tienda"}
        subtitle="Registra la identificación, ubicación y capacidad operativa de la tienda."
        onClose={closeEditor}
      >
        {editing && (
          <form className="form-grid" onSubmit={save}>
            {formError && <div className="span-2"><Notice type="error" onClose={() => setFormError("")}>{formError}</Notice></div>}
            <div className="form-section-title span-2"><strong>Identificación</strong><span>Datos principales para reconocer la tienda.</span></div>
            <Field label="Nombre *"><input required minLength="2" maxLength="120" value={editing.nombre} onChange={(e) => set("nombre", e.target.value)} /></Field>
            <Field label="Código *" hint="Solo letras, números y guiones."><input required minLength="2" maxLength="20" pattern="[A-Z0-9-]+" value={editing.codigo || ""} onChange={(e) => set("codigo", e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))} placeholder="Ej. TRU-01" /></Field>
            <Field label="Dirección *" className="span-2">
              <input required maxLength="180" value={editing.direccion || ""} onChange={(e) => set("direccion", e.target.value)} placeholder="Av. Ejemplo 123" />
            </Field>
            <Field label="Departamento *" hint="Selecciona primero el departamento."><select required value={editing.departamento || ""} onChange={(e) => setEditing((current) => ({ ...current, departamento: e.target.value, provincia: "", distrito: "" }))}><option value="">Selecciona un departamento</option>{editing.departamento && !departments.includes(editing.departamento) && <option value={editing.departamento}>{editing.departamento}</option>}{departments.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
            <Field label="Provincia *"><select required disabled={!editing.departamento} value={editing.provincia || ""} onChange={(e) => setEditing((current) => ({ ...current, provincia: e.target.value, distrito: "" }))}><option value="">Selecciona una provincia</option>{editing.provincia && !provinces.includes(editing.provincia) && <option value={editing.provincia}>{editing.provincia}</option>}{provinces.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
            <Field label="Distrito *"><select required disabled={!editing.provincia} value={editing.distrito || ""} onChange={(e) => set("distrito", e.target.value)}><option value="">Selecciona un distrito</option>{editing.distrito && !districts.includes(editing.distrito) && <option value={editing.distrito}>{editing.distrito}</option>}{districts.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
            <Field label="Zona"><input maxLength="80" value={editing.zona || ""} onChange={(e) => set("zona", e.target.value.toUpperCase())} /></Field>
            <div className="form-section-title span-2"><strong>Formato y vigencia</strong><span>Características comerciales y fechas de operación.</span></div>
            <Field label="Formato *"><select required value={editing.formato || ""} onChange={(e) => set("formato", e.target.value)}><option value="">Selecciona un formato</option>{catalogs.formatos.map((value) => <option key={value} value={value}>{value === "PROPIA" ? "Propia" : "Metro"}</option>)}</select></Field>
            <Field label="Fecha de apertura *"><input required type="date" value={editing.fecha_apertura || ""} onChange={(e) => set("fecha_apertura", e.target.value)} /></Field>
            <Field label="Fecha de cierre" hint={editing.estado === "inactivo" ? "Obligatoria para una tienda inactiva." : "Opcional mientras la tienda esté activa."}><input required={editing.estado === "inactivo"} type="date" min={editing.fecha_apertura || undefined} value={editing.fecha_cierre || ""} onChange={(e) => set("fecha_cierre", e.target.value)} /></Field>
            <div className="form-section-title span-2"><strong>Capacidad operativa</strong><span>Metraje, stock, dotación y costo mensual.</span></div>
            <Field label="Metraje (m²)"><input type="number" min="0" step="0.01" value={editing.metraje_m2 ?? ""} onChange={(e) => set("metraje_m2", e.target.value)} /></Field>
            <Field label="Capacidad de stock"><input type="number" min="0" step="1" value={editing.capacidad_stock_unid ?? ""} onChange={(e) => set("capacidad_stock_unid", e.target.value)} /></Field>
            <Field label="Colaboradores habituales"><input type="number" min="0" step="1" value={editing.cant_colaboradores_normal ?? ""} onChange={(e) => set("cant_colaboradores_normal", e.target.value)} /></Field>
            <Field label="Colaboradores en campaña"><input type="number" min="0" step="1" value={editing.colaboradores_camp ?? ""} onChange={(e) => set("colaboradores_camp", e.target.value)} /></Field>
            <Field label="Alquiler mensual (S/)"><input type="number" min="0" step="0.01" value={editing.alquiler_mensual ?? ""} onChange={(e) => set("alquiler_mensual", e.target.value)} /></Field>
            <Field label="Jefe de tienda" hint="Solo usuarios activos.">
              <select value={editing.jefe_id} onChange={(e) => set("jefe_id", e.target.value)}>
                <option value="">Sin asignar</option>
                {jefeOptions.map((u) => <option key={u.id} value={u.id}>{u.nombres} {u.apellidos}</option>)}
              </select>
            </Field>
            {isZonal ? <Field label="Clúster asignado" hint="Las tiendas creadas quedan dentro de tu clúster."><input disabled value={zonalCluster?`${zonalCluster.nombre}${zonalCluster.codigo?` · ${zonalCluster.codigo}`:""}`:"Sin clúster asignado"}/></Field> : <Field label="Clúster">
              <select required value={editing.cluster_id || ""} onChange={(e) => set("cluster_id", e.target.value)}>
                <option value="">Selecciona un clúster</option>
                {clusters.filter((c) => c.estado === "activo" || String(c.id) === String(editing.cluster_id)).map((c) => <option value={c.id} key={c.id}>{c.nombre}</option>)}
              </select>
            </Field>}
            <Field label="Estado *">
              <select required value={editing.estado} onChange={(e) => setEditing((current) => ({ ...current, estado: e.target.value, fecha_cierre: e.target.value === "activo" ? "" : current.fecha_cierre }))}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </Field>
            <div className="form-actions span-2">
              <button type="button" className="button button--ghost" onClick={closeEditor}>Cancelar</button>
              <button className="button button--primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        )}
      </Modal>
      <Modal open={!!viewing} extraWide title={viewing ? viewing.nombre : "Tienda"} subtitle="Consulta información, equipo y reportes sin mezclar sus responsabilidades." onClose={() => setViewing(null)}>
        {viewing && <>
          <div className="module-view-tabs">
            <button className={detailView==="informacion"?"active":""} onClick={()=>setDetailView("informacion")}>Información</button>
            <button className={detailView==="equipo"?"active":""} onClick={()=>setDetailView("equipo")}>Equipo</button>
            <button className={detailView==="reportes"?"active":""} onClick={()=>setDetailView("reportes")}>Reportes de tienda</button>
          </div>
          {detailView === "reportes" && <Reportes user={user} embedded fixedStoreId={viewing.id} initialKind="documentos" allowedKinds={["documentos","reclamaciones","acciones","bitacora","requerimientos","mejoras"]}/>}
          {detailView === "informacion" && <dl className="store-detail-grid">
            {[['Estado',<StatusBadge key="estado" value={viewing.estado}/>],['Código',viewing.codigo],['Dirección',viewing.direccion],['Distrito',viewing.distrito],['Provincia',viewing.provincia],['Departamento',viewing.departamento],['Zona',viewing.zona],['Formato',viewing.formato],['Fecha de apertura',viewing.fecha_apertura],['Fecha de cierre',viewing.fecha_cierre],['Metraje',viewing.metraje_m2!=null?`${viewing.metraje_m2} m²`:null],['Capacidad de stock',viewing.capacidad_stock_unid],['Dotación habitual',viewing.cant_colaboradores_normal],['Dotación en campaña',viewing.colaboradores_camp],['Alquiler mensual',viewing.alquiler_mensual!=null?`S/ ${Number(viewing.alquiler_mensual).toLocaleString('es-PE',{minimumFractionDigits:2})}`:null],['Clúster',viewing.cluster_nombre]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value === null || value === undefined || value === "" ? "Sin registrar" : value}</dd></div>)}
          </dl>}
          {detailView === "equipo" && (!storeUsers ? <Loading label="Cargando equipo de la tienda..." /> : <div className="store-users">
            <section className="store-users__leader">
              <div className="store-users__icon"><Crown size={18} /></div>
              <div><span>Administrador de tienda</span><strong>{viewing.jefe_nombre || "Sin administrador asignado"}</strong><small>{viewing.jefe_nombre ? <>Estado: <StatusBadge value={viewing.jefe_estado}/></> : "La tienda puede continuar activa y recibir un nuevo administrador."}</small></div>
            </section>
            <div className="store-users__heading"><div><span className="eyebrow">Equipo operativo</span><h3>{filteredTeam.length} de {teamMembers.length} personas</h3></div><select value={teamRole} onChange={(event)=>setTeamRole(event.target.value)}><option value="todos">Todos los roles</option>{teamRoles.map((role)=><option key={role} value={role}>{roleLabels[role] || role.replaceAll("_"," ")}</option>)}</select></div>
            {filteredTeam.length ? <><div className="store-users__list">{filteredTeam.slice((teamPage-1)*5,teamPage*5).map((item) => <div className="store-user-row" key={item.id}><span className="avatar">{item.nombres.charAt(0).toUpperCase()}</span><div><strong>{item.nombres} {item.apellidos}</strong><small>{roleLabels[item.rol] || item.rol?.replaceAll("_", " ")} · {item.usuario ? `@${item.usuario}` : "Sin credenciales"}</small></div><StatusBadge value={item.estado} /></div>)}</div><Pagination page={teamPage} pages={Math.max(1,Math.ceil(filteredTeam.length/5))} onChange={setTeamPage}/></> : <EmptyState icon={UsersRound} title="Sin personal con ese rol" text="Prueba con otro filtro o registra personal desde Mis equipos." />}
          </div>)}
        </>}
      </Modal>
      <SuccessDialog open={!!success} title={success?.title} message={success?.message} onContinue={() => setSuccess(null)} />
    </>
  );
}
