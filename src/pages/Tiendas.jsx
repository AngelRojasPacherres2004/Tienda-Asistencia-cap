import { useEffect, useMemo, useState } from "react";
import { Building2, Crown, Pencil, Trash2, UsersRound, X } from "lucide-react";
import { api } from "../lib/api";
import {
  ConfirmDialog, EmptyState, Field, Loading, Modal, Notice, PageHeader, SearchInput, StatusBadge, SuccessDialog,
} from "../components/UI";

const blank = { nombre: "", direccion: "", jefe_id: "", zonal_id: "", estado: "activo" };

export default function Tiendas() {
  const [items, setItems] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [storeUsers, setStoreUsers] = useState(null);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = () => api("/tiendas").then(setItems).catch((err) => setNotice({ type: "error", text: err.message }));
  const loadUsuarios = () => api("/usuarios").then(setUsuarios).catch(() => {});
  useEffect(() => { load(); loadUsuarios(); }, []);

  const filtered = useMemo(() => (items || []).filter((item) =>
    [item.nombre, item.direccion, item.jefe_nombre].join(" ").toLowerCase().includes(search.toLowerCase()),
  ), [items, search]);

  const zonalOptions = usuarios.filter((u) => u.estado === "activo" && u.rol === "jefe_zonal");

  const openUsers = (item) => {
    setViewing(item);
    setStoreUsers(null);
    api(`/tiendas/${item.id}/usuarios`).then(setStoreUsers).catch((err) => setNotice({ type: "error", text: err.message }));
  };
  const closeEditor = () => { setEditing(null); setFormError(""); };
  const openNew = () => { setFormError(""); setEditing({ ...blank }); };
  const openEdit = (item) => { setFormError(""); setEditing({ ...item, jefe_id: item.jefe_id || "", zonal_id: item.zonal_id || "" }); };
  const set = (field, value) => setEditing((current) => ({ ...current, [field]: value }));

  const save = async (event) => {
    event.preventDefault();
    setBusy(true); setFormError("");
    try {
      const payload = { ...editing, jefe_id: editing.jefe_id ? Number(editing.jefe_id) : null, zonal_id: editing.zonal_id ? Number(editing.zonal_id) : null };
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
  const remove = async () => {
    if (!deleting) return;
    setBusy(true); setNotice(null);
    try {
      const result = await api(`/tiendas/${deleting.id}`, { method: "DELETE" });
      setDeleting(null); await load();
      setSuccess({ title: result.inhabilitado ? "Tienda inhabilitada" : "Tienda eliminada", message: result.inhabilitado ? "La tienda tiene usuarios vinculados, por eso fue marcada como inactiva." : "La tienda fue eliminada correctamente." });
    } catch (err) { setNotice({ type: "error", text: err.message }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Operación"
        title="Tiendas"
        subtitle="Crea tiendas, asígnales un jefe y administra su estado."
        action={<button className="button button--primary" onClick={openNew}>Nueva tienda</button>}
      />
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar tienda, dirección o jefe…" />
        <span>{filtered.length} tiendas</span>
      </div>

      {!items ? <Loading /> : filtered.length ? (
        <div className="company-grid">
          {filtered.map((item) => (
            <article className="company-card" key={item.id}>
              <div className="company-card__head">
                <span className="company-logo">{item.nombre.slice(0, 2).toUpperCase()}</span>
                <StatusBadge value={item.estado} />
              </div>
              <h3>{item.nombre}</h3>
              <p>{item.direccion || "Sin dirección registrada"}</p>
              <dl>
                <div><dt>Jefe zonal</dt><dd>{item.zonal_nombre || "Sin asignar"}</dd></div>
                <div><dt>Creada</dt><dd>{new Date(item.fecha_creacion).toLocaleDateString("es-PE")}</dd></div>
              </dl>
              <div className="company-card__footer">
                <button onClick={() => openUsers(item)}><UsersRound size={14} />Usuarios</button>
                <button onClick={() => openEdit(item)}><Pencil size={14} />Editar</button>
                <button onClick={() => setDeleting(item)}><Trash2 size={14} />Eliminar</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={Building2} title="Sin tiendas" text="Aún no hay tiendas registradas con ese criterio de búsqueda." />
      )}

      <Modal
        open={!!editing}
        title={editing?.id ? "Editar tienda" : "Nueva tienda"}
        subtitle="Los campos marcados son obligatorios."
        onClose={closeEditor}
      >
        {editing && (
          <form className="form-grid" onSubmit={save}>
            {formError && <div className="span-2"><Notice type="error" onClose={() => setFormError("")}>{formError}</Notice></div>}
            <Field label="Nombre" className="span-2"><input required value={editing.nombre} onChange={(e) => set("nombre", e.target.value)} /></Field>
            <Field label="Dirección" className="span-2">
              <input value={editing.direccion || ""} onChange={(e) => set("direccion", e.target.value)} placeholder="Av. Ejemplo 123, distrito" />
            </Field>
            <Field label="Jefe zonal" hint="Solo jefes zonales activos.">
              <select value={editing.zonal_id} onChange={(e) => set("zonal_id", e.target.value)}>
                <option value="">Sin asignar</option>
                {zonalOptions.map((u) => <option key={u.id} value={u.id}>{u.nombres} {u.apellidos}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select value={editing.estado} onChange={(e) => set("estado", e.target.value)}>
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
      <Modal open={!!viewing} wide title={viewing ? `Usuarios de ${viewing.nombre}` : "Usuarios"} subtitle="El jefe de tienda aparece separado del equipo operativo." onClose={() => setViewing(null)}>
        {!storeUsers ? <Loading label="Cargando usuarios de la tienda..." /> : <div className="store-users">
          <section className="store-users__leader">
            <div className="store-users__icon"><Crown size={18} /></div>
            <div><span>Jefe de tienda</span><strong>{viewing?.jefe_nombre || "Sin jefe asignado"}</strong><small>Responsable de la operación de esta tienda</small></div>
          </section>
          <div className="store-users__heading"><div><span className="eyebrow">Equipo operativo</span><h3>{storeUsers.filter((item) => item.rol !== "jefe_tienda").length} usuarios</h3></div><button className="icon-button" onClick={() => setViewing(null)} aria-label="Cerrar"><X size={17} /></button></div>
          {storeUsers.length ? <div className="store-users__list">{storeUsers.filter((item) => item.rol !== "jefe_tienda").map((item) => <div className="store-user-row" key={item.id}><span className="avatar">{item.nombres.charAt(0).toUpperCase()}</span><div><strong>{item.nombres} {item.apellidos}</strong><small>@{item.usuario} · {item.fecha_ingreso || "Sin fecha de ingreso"}</small></div><StatusBadge value={item.estado} /></div>)}</div> : <EmptyState icon={UsersRound} title="Sin usuarios operativos" text="Esta tienda todavía no tiene empleados registrados." />}
        </div>}
      </Modal>
      <SuccessDialog open={!!success} title={success?.title} message={success?.message} onContinue={() => setSuccess(null)} />
      <ConfirmDialog open={!!deleting} title="Eliminar tienda" message={`¿Seguro que quieres eliminar ${deleting?.nombre || "esta tienda"}?`} busy={busy} onConfirm={remove} onClose={() => setDeleting(null)} />
    </>
  );
}
