import { useEffect, useMemo, useState } from "react";
import { Layers3, Pencil, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { ConfirmDialog, EmptyState, Field, Loading, Modal, Notice, PageHeader, StatusBadge, SuccessDialog } from "../components/UI";

const blank = { nombre: "", codigo: "", jefe_zonal_id: "", tienda_ids: [], estado: "activo" };

export default function Clusters() {
  const [items, setItems] = useState(null);
  const [zonales, setZonales] = useState([]);
  const [stores, setStores] = useState([]);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [success, setSuccess] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = () => Promise.all([api("/clusters"), api("/usuarios"), api("/tiendas")])
    .then(([clusters, users, shops]) => {
      setItems(clusters);
      setZonales(users.filter((user) => user.rol === "jefe_zonal" && user.estado === "activo"));
      setStores(shops);
    }).catch((error) => setNotice({ type: "error", text: error.message }));
  useEffect(() => { load(); }, []);

  const availableZonales = useMemo(() => zonales.filter((zonal) =>
    !items?.some((cluster) => cluster.jefe_zonal_id === zonal.id && cluster.id !== editing?.id),
  ), [zonales, items, editing]);
  const availableStores = stores.filter((store) => !store.cluster_id || store.cluster_id === editing?.id);

  const openEditor = (cluster = null) => setEditing(cluster ? {
    ...cluster, jefe_zonal_id: cluster.jefe_zonal_id || "", tienda_ids: cluster.tiendas.map((store) => store.id),
  } : { ...blank });
  const set = (field, value) => setEditing((current) => ({ ...current, [field]: value }));
  const toggleStore = (storeId) => setEditing((current) => ({
    ...current,
    tienda_ids: current.tienda_ids.includes(storeId)
      ? current.tienda_ids.filter((id) => id !== storeId)
      : [...current.tienda_ids, storeId],
  }));
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      await api(editing.id ? `/clusters/${editing.id}` : "/clusters", {
        method: editing.id ? "PUT" : "POST",
        body: { ...editing, jefe_zonal_id: Number(editing.jefe_zonal_id) || null, tienda_ids: editing.tienda_ids.map(Number) },
      });
      setEditing(null); await load();
      setSuccess({ title: "Clúster guardado", message: "Las tiendas y el jefe zonal quedaron asignados correctamente." });
    } catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setNotice(null);
    try {
      await api(`/clusters/${deleting.id}`, { method: "DELETE" });
      const name = deleting.nombre; setDeleting(null); await load();
      setSuccess({ title: "Clúster eliminado", message: `${name} fue eliminado. Sus tiendas quedaron disponibles para reasignarlas.` });
    } catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { setBusy(false); }
  };

  return <>
    <PageHeader eyebrow="Estructura comercial" title="Clústeres" subtitle="Selecciona las tiendas que forman cada clúster y el jefe zonal responsable." action={<button className="button button--primary" onClick={() => openEditor()}>Nuevo clúster</button>} />
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
    {!items ? <Loading /> : items.length ? <div className="company-grid">{items.map((item) => <article className="company-card" key={item.id}>
      <div className="company-card__head"><span className="company-logo">{item.codigo.slice(0, 2)}</span><StatusBadge value={item.estado} /></div>
      <h3>{item.nombre}</h3><p>{item.codigo}</p><dl><div><dt>Jefe zonal</dt><dd>{item.jefe_nombre || "Sin asignar"}</dd></div><div><dt>Tiendas</dt><dd>{item.tiendas.length}</dd></div></dl>
      <div className="company-card__footer"><span>{item.tiendas.map((store) => store.nombre).join(", ") || "Sin tiendas"}</span><button onClick={() => openEditor(item)}><Pencil size={14} />Editar</button><button className="danger" onClick={() => setDeleting(item)}><Trash2 size={14} />Eliminar</button></div>
    </article>)}</div> : <EmptyState icon={Layers3} title="Sin clústeres" text="Crea el primer clúster, selecciona sus tiendas y asigna un jefe zonal." />}
    <Modal open={!!editing} title={editing?.id ? "Editar clúster" : "Nuevo clúster"} subtitle="Cada tienda y cada jefe zonal solo pueden pertenecer a un clúster." onClose={() => setEditing(null)}>
      {editing && <form className="form-grid" onSubmit={save}>
        <Field label="Nombre"><input required value={editing.nombre} onChange={(event) => set("nombre", event.target.value)} /></Field>
        <Field label="Código"><input required value={editing.codigo} onChange={(event) => set("codigo", event.target.value.toUpperCase())} /></Field>
        <Field label="Jefe zonal" className="span-2"><select required value={editing.jefe_zonal_id} onChange={(event) => set("jefe_zonal_id", event.target.value)}><option value="">Selecciona un jefe zonal</option>{availableZonales.map((zonal) => <option value={zonal.id} key={zonal.id}>{zonal.nombres} {zonal.apellidos}</option>)}</select></Field>
        <Field label="Tiendas del clúster" className="span-2" hint={`${editing.tienda_ids.length} tienda(s) seleccionada(s)`}>
          <div className="cluster-store-picker">
            {availableStores.length ? availableStores.map((store) => {
              const selected = editing.tienda_ids.includes(store.id);
              return <label className={selected ? "selected" : ""} key={store.id}>
                <input type="checkbox" checked={selected} onChange={() => toggleStore(store.id)} />
                <span><strong>{store.nombre}</strong><small>{store.direccion || "Sin dirección registrada"}</small></span>
                <i>{selected ? "Seleccionada" : "Marcar"}</i>
              </label>;
            }) : <p className="store-empty-copy">No hay tiendas disponibles para asignar.</p>}
          </div>
          {!editing.tienda_ids.length && <small className="field__error">Selecciona al menos una tienda.</small>}
        </Field>
        <Field label="Estado" className="span-2"><select value={editing.estado} onChange={(event) => set("estado", event.target.value)}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></Field>
        <div className="form-actions span-2"><button type="button" className="button button--ghost" onClick={() => setEditing(null)}>Cancelar</button><button className="button button--primary" disabled={busy || !editing.tienda_ids.length}>{busy ? "Guardando…" : "Guardar clúster"}</button></div>
      </form>}
    </Modal>
    <ConfirmDialog open={!!deleting} title="Eliminar clúster" message={`¿Seguro que quieres eliminar ${deleting?.nombre}? Las tiendas no se eliminarán; quedarán sin clúster para poder reasignarlas.`} busy={busy} onClose={() => setDeleting(null)} onConfirm={remove} />
    <SuccessDialog open={!!success} title={success?.title} message={success?.message} onContinue={() => setSuccess(null)} />
  </>;
}
