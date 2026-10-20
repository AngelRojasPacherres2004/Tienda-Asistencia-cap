import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Plus, UsersRound } from "lucide-react";
import { api, formatDate } from "../lib/api";
import { EmptyState, Field, Loading, Modal, Notice, Pagination, SearchInput, StatusBadge } from "../components/UI";
import "../store-support.css";

export default function ApoyoTienda() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ usuario_id: "", tienda_id: "", habilitado: true });
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const load = useCallback(async () => {
    const data = await api("/zonal/apoyos-tienda");
    setCatalog(data); setError("");
  }, []);
  useEffect(() => { load().catch(err => setError(err.message)); }, [load]);
  const names = useMemo(() => new Map((catalog?.tiendas || []).map(store => [Number(store.id), store.nombre])), [catalog]);
  const admin = catalog?.administradores.find(person => String(person.id) === form.usuario_id);
  const assignedIds = new Set((catalog?.asignaciones || []).filter(row => Number(row.usuario_id) === Number(form.usuario_id)).map(row => Number(row.tienda_id)));
  const availableStores = (catalog?.tiendas || []).filter(store => Number(store.id) !== Number(admin?.tienda_id) && !assignedIds.has(Number(store.id)));
  const rows = (catalog?.asignaciones || []).filter(row => (!status || String(row.habilitado) === status)
    && `${row.administrador.nombres} ${row.administrador.apellidos} ${row.administrador.dni} ${row.tienda_nombre} ${row.tienda_principal_nombre}`.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")));
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const currentPage = Math.min(page, pages);
  const openNew = () => { setForm({ usuario_id: "", tienda_id: "", habilitado: true }); setFormError(""); setEditing(true); };
  const save = async event => {
    event.preventDefault(); setBusy(true); setFormError("");
    try {
      await api("/zonal/apoyos-tienda", { method: "POST", body: form });
      setEditing(false); setNotice("Apoyo guardado. El administrador podrá seleccionar la tienda cuando esté habilitado.");
      await load().catch(err => setError(err.message));
    } catch (err) { setFormError(err.message); }
    finally { setBusy(false); }
  };
  const toggle = async row => {
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/zonal/apoyos-tienda/${row.id}`, { method: "PATCH", body: { habilitado: !row.habilitado } });
      await load();
      setNotice(row.habilitado ? "Apoyo deshabilitado. La tienda deja de estar disponible para ese administrador." : "Apoyo habilitado. El administrador ya puede seleccionar la tienda.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <section className="store-support">
    <div className="store-support-heading"><div><h2>Apoyo tienda</h2><p>Asigna acceso de administrador a otra tienda de tu zona. Su tienda principal se mantiene.</p></div><button className="button button--primary" disabled={!catalog || busy} onClick={openNew}><Plus size={17} />Asignar tienda</button></div>
    {error && <Notice type="error" onClose={() => setError("")}>{error} <button className="button button--ghost button--small" onClick={() => load().catch(err => setError(err.message))}>Reintentar</button></Notice>}
    {notice && <Notice onClose={() => setNotice("")}>{notice}</Notice>}
    {!catalog ? (!error && <Loading />) : <>
      <div className="toolbar"><SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder="Buscar administrador, DNI o tienda…" /><select aria-label="Estado del apoyo" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Todos los estados</option><option value="true">Habilitados</option><option value="false">Deshabilitados</option></select><span>{rows.length} {rows.length === 1 ? "asignación" : "asignaciones"}</span></div>
      {rows.length ? <div className="table-panel store-support-table"><table><thead><tr><th>Administrador</th><th>Tienda principal</th><th>Tienda de apoyo</th><th>Registro</th><th>Estado</th><th>Acceso</th></tr></thead><tbody>{rows.slice((currentPage - 1) * 10, currentPage * 10).map(row => <tr key={row.id}>
        <td><div className="person-cell"><span className="avatar">{row.administrador.nombres.charAt(0)}</span><div><strong>{row.administrador.nombres} {row.administrador.apellidos}</strong><small>DNI {row.administrador.dni}{row.administrador.estado !== "activo" ? " · Administrador inactivo" : ""}</small></div></div></td>
        <td data-label="Tienda principal">{row.tienda_principal_nombre || "Sin tienda"}</td><td data-label="Tienda de apoyo"><span className="store-support-destination"><Building2 size={16} />{row.tienda_nombre}</span></td><td data-label="Registro">{formatDate(row.created_at)}</td>
        <td data-label="Estado"><StatusBadge value={row.habilitado ? "activo" : "inactivo"} label={row.habilitado ? "Habilitado" : "Deshabilitado"} /></td>
        <td><button className={`button button--small ${row.habilitado ? "button--ghost" : "button--soft"}`} disabled={busy} onClick={() => toggle(row)} aria-label={`${row.habilitado ? "Deshabilitar" : "Habilitar"} apoyo de ${row.administrador.nombres} en ${row.tienda_nombre}`}>{row.habilitado ? "Deshabilitar" : "Habilitar"}</button></td>
      </tr>)}</tbody></table><Pagination page={currentPage} pages={pages} onChange={setPage} /></div> : <EmptyState icon={UsersRound} title={search || status ? "Sin asignaciones con esos filtros" : "Aún no hay apoyos asignados"} text="Los apoyos guardados aparecen aquí y puedes habilitarlos o deshabilitarlos cuando lo necesites." />}
    </>}
    <Modal open={editing} title="Asignar tienda de apoyo" subtitle="El administrador tendrá las mismas funciones de su rol en la tienda seleccionada." onClose={() => { if (!busy) setEditing(false); }}>
      <form onSubmit={save}>
        {formError && <Notice type="error">{formError}</Notice>}
        <div className="form-grid">
          <Field label="Administrador" required><select required value={form.usuario_id} onChange={event => setForm({ ...form, usuario_id: event.target.value, tienda_id: "" })}><option value="">Selecciona un administrador</option>{catalog?.administradores.map(person => <option key={person.id} value={String(person.id)}>{person.nombres} {person.apellidos} · {names.get(Number(person.tienda_id))}</option>)}</select></Field>
          <Field label="Tienda de apoyo" required><select required disabled={!admin} value={form.tienda_id} onChange={event => setForm({ ...form, tienda_id: event.target.value })}><option value="">Selecciona una tienda</option>{availableStores.map(store => <option key={store.id} value={String(store.id)}>{store.nombre}</option>)}</select></Field>
        </div>
        {admin && <p className="store-support-hint">Tienda principal: <strong>{names.get(Number(admin.tienda_id))}</strong>. Las tiendas ya asignadas se administran desde el listado.</p>}
        {admin && !availableStores.length && <Notice type="error">No hay otra tienda disponible para este administrador en tu zona.</Notice>}
        <label className="store-support-check"><input type="checkbox" checked={form.habilitado} onChange={event => setForm({ ...form, habilitado: event.target.checked })} />Habilitar acceso a la tienda de apoyo</label>
        <div className="form-actions"><button className="button button--ghost" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancelar</button><button className="button button--primary" disabled={busy || !form.usuario_id || !form.tienda_id}>{busy ? "Guardando…" : "Guardar asignación"}</button></div>
      </form>
    </Modal>
  </section>;
}
