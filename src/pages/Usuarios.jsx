import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Edit3, FileUp, Trash2, UsersRound } from "lucide-react";
import ExcelJS from "exceljs";
import { api, downloadFile, todayISO } from "../lib/api";
import {
  ConfirmDialog, EmptyState, Field, Loading, Modal, Notice, PageHeader, SearchInput, StatusBadge,
} from "../components/UI";

const roleLabels = { admin: "Administrador", jefe_tienda: "Jefe de tienda", empleado: "Empleado" };
const blank = {
  nombres: "", apellidos: "", dni: "", usuario: "", password: "",
  telefono: "", rol: "empleado", tienda_id: "", estado: "activo", fecha_ingreso: todayISO(), fecha_salida: "",
};

export default function Usuarios({ user }) {
  const isAdmin = user?.rol === "admin";
  const [items, setItems] = useState(null);
  const [tiendas, setTiendas] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const importInput = useRef(null);

  const load = () => api("/usuarios").then(setItems).catch((err) => setNotice({ type: "error", text: err.message }));
  const loadTiendas = useCallback(
    () => (isAdmin ? api("/tiendas").then(setTiendas).catch(() => {}) : Promise.resolve()),
    [isAdmin],
  );
  useEffect(() => { load(); loadTiendas(); }, [loadTiendas]);

  const filtered = useMemo(() => (items || []).filter((item) =>
    [item.nombres, item.apellidos, item.dni, item.usuario, item.tienda_nombre]
      .join(" ").toLowerCase().includes(search.toLowerCase()),
  ), [items, search]);

  const openNew = () => setEditing({ ...blank });
  const openEdit = (item) => setEditing({ ...item, tienda_id: item.tienda_id || "", password: "" });
  const set = (field, value) => setEditing((current) => ({ ...current, [field]: value }));

  const save = async (event) => {
    event.preventDefault();
    setBusy(true); setNotice(null);
    try {
      const payload = { ...editing, tienda_id: editing.rol === "admin" ? null : Number(editing.tienda_id) || null };
      if (!payload.password) delete payload.password;
      await api(editing.id ? `/usuarios/${editing.id}` : "/usuarios", {
        method: editing.id ? "PUT" : "POST", body: payload,
      });
      setEditing(null);
      await load();
      setNotice({ type: "success", text: editing.id ? "Usuario actualizado." : "Usuario creado correctamente." });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true); setNotice(null);
    try {
      const result = await api(`/usuarios/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      await load();
      setNotice({
        type: "success",
        text: result.inhabilitado
          ? "Ese usuario ya tiene historial registrado, así que se inhabilitó en vez de eliminarse."
          : "Usuario eliminado.",
      });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const downloadUsers = (template = false) => downloadFile(`/api/usuarios/export.xlsx${template ? "?plantilla=1" : ""}`, template ? "plantilla-usuarios.xlsx" : "usuarios.xlsx")
    .catch((err) => setNotice({ type: "error", text: err.message }));

  const importUsers = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true); setNotice(null);
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      const headers = {};
      sheet.getRow(1).eachCell((cell, column) => { headers[String(cell.value || "").trim().toLowerCase()] = column; });
      const value = (row, header) => row.getCell(headers[header.toLowerCase()] || 0).value;
      const rows = [];
      sheet.eachRow((row, index) => {
        if (index === 1 || !value(row, "nombres")) return;
        const tiendaName = String(value(row, "tienda") || "").trim().toLowerCase();
        const tienda = tiendas.find((item) => item.nombre.toLowerCase() === tiendaName);
        rows.push({
          nombres: String(value(row, "nombres") || "").trim(), apellidos: String(value(row, "apellidos") || "").trim(),
          dni: String(value(row, "dni") || "").replace(/\.0$/, "").padStart(8, "0"), usuario: String(value(row, "usuario") || "").trim(),
          password: String(value(row, "contraseña") || value(row, "contrasena") || ""), telefono: String(value(row, "teléfono") || value(row, "telefono") || "").replace(/\.0$/, ""),
          rol: String(value(row, "rol") || "empleado").trim().toLowerCase().replace("jefe de tienda", "jefe_tienda").replace("administrador", "admin"),
          tienda_id: tienda?.id || (isAdmin ? "" : user.tienda_id), estado: String(value(row, "estado") || "activo").trim().toLowerCase(),
          fecha_ingreso: String(value(row, "fecha de ingreso") || todayISO()).slice(0, 10), fecha_salida: String(value(row, "fecha de salida") || "").slice(0, 10) || null,
        });
      });
      const result = await api("/usuarios/import", { method: "POST", body: { rows } });
      await load();
      setNotice({ type: result.errores.length ? "error" : "success", text: `${result.creados} usuarios importados${result.errores.length ? `; ${result.errores.length} filas con error.` : "."}` });
    } catch (err) {
      setNotice({ type: "error", text: err.message || "No se pudo leer el archivo Excel." });
    } finally { setBusy(false); }
  };

  const tiendaOptions = tiendas.filter((t) => t.estado === "activo" || String(t.id) === String(editing?.tienda_id));

  return (
    <>
      <PageHeader
        eyebrow={isAdmin ? "Equipo" : "Mi tienda"}
        title={isAdmin ? "Usuarios" : "Mi equipo"}
        subtitle={isAdmin ? "Administradores, jefes de tienda y empleados con acceso al sistema." : "Empleados de tu tienda con acceso al sistema."}
        action={<div className="header-actions">
          <button className="button button--ghost" onClick={() => downloadUsers(true)}><Download size={15} />Plantilla</button>
          <button className="button button--ghost" onClick={() => importInput.current?.click()} disabled={busy}><FileUp size={15} />Importar Excel</button>
          <button className="button button--soft" onClick={() => downloadUsers()}><Download size={15} />Exportar Excel</button>
          <input ref={importInput} type="file" accept=".xlsx" onChange={importUsers} hidden />
          <button className="button button--primary" onClick={openNew}>Nuevo usuario</button>
        </div>}
      />
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, DNI o usuario…" />
        <span>{filtered.length} usuarios</span>
      </div>

      {!items ? <Loading /> : filtered.length ? (
        <div className="table-panel">
          <div className={`data-table ${isAdmin ? "data-table--usuarios" : "data-table--usuarios-tienda"}`}>
            <div className="data-table__head">
              <span>Persona</span><span>DNI</span><span>Usuario</span><span>Teléfono</span>
              {isAdmin && <><span>Rol</span><span>Tienda</span></>}
              <span>Estado</span><span />
            </div>
            {filtered.map((item) => (
              <div className="data-table__row" key={item.id}>
                <div className="person-cell">
                  <span className="avatar">{item.nombres.charAt(0).toUpperCase()}</span>
                  <div><strong>{item.nombres} {item.apellidos}</strong><small>@{item.usuario}</small></div>
                </div>
                <span className="mono">{item.dni}</span>
                <span className="cell-primary">{item.usuario}</span>
                <span>{item.telefono || "—"}</span>
                {isAdmin && <>
                  <span className={`role role--${item.rol}`}>{roleLabels[item.rol]}</span>
                  <span>{item.tienda_nombre || "—"}</span>
                </>}
                <span><StatusBadge value={item.estado} /></span>
                <div className="row-actions">
                  <button onClick={() => openEdit(item)} aria-label="Editar"><Edit3 size={15} /></button>
                  <button className="danger" onClick={() => setDeleting(item)} aria-label="Eliminar"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState icon={UsersRound} title="Sin usuarios" text="Aún no hay usuarios registrados con ese criterio de búsqueda." />
      )}

      <Modal
        open={!!editing}
        title={editing?.id ? "Editar usuario" : "Nuevo usuario"}
        subtitle="Los campos marcados son obligatorios."
        onClose={() => setEditing(null)}
      >
        {editing && (
          <form className="form-grid" onSubmit={save}>
            <Field label="Nombres"><input required value={editing.nombres} onChange={(e) => set("nombres", e.target.value)} /></Field>
            <Field label="Apellidos"><input required value={editing.apellidos} onChange={(e) => set("apellidos", e.target.value)} /></Field>
            <Field label="DNI"><input required maxLength={8} value={editing.dni} onChange={(e) => set("dni", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Teléfono" hint="9 dígitos, opcional"><input maxLength={9} value={editing.telefono} onChange={(e) => set("telefono", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Usuario"><input required value={editing.usuario} onChange={(e) => set("usuario", e.target.value)} /></Field>
            <Field label={editing.id ? "Nueva contraseña" : "Contraseña"} hint={editing.id ? "Déjala vacía para conservar la actual." : "Mínimo 6 caracteres."}>
              <input required={!editing.id} type="password" value={editing.password} onChange={(e) => set("password", e.target.value)} />
            </Field>
            <Field label="Fecha de ingreso"><input required type="date" value={editing.fecha_ingreso || ""} onChange={(e) => set("fecha_ingreso", e.target.value)} /></Field>
            <Field label="Fecha de salida" hint="Déjala vacía si sigue activo."><input type="date" min={editing.fecha_ingreso || undefined} value={editing.fecha_salida || ""} onChange={(e) => set("fecha_salida", e.target.value)} /></Field>
            {isAdmin && (
              <>
                <Field label="Rol">
                  <select value={editing.rol} onChange={(e) => set("rol", e.target.value)}>
                    <option value="empleado">Empleado</option>
                    <option value="jefe_tienda">Jefe de tienda</option>
                    <option value="admin">Administrador</option>
                  </select>
                </Field>
                <Field label="Tienda" hint={editing.rol === "admin" ? "No aplica para administradores." : undefined}>
                  <select required={editing.rol !== "admin"} disabled={editing.rol === "admin"} value={editing.tienda_id} onChange={(e) => set("tienda_id", e.target.value)}>
                    <option value="">Selecciona una tienda</option>
                    {tiendaOptions.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </Field>
              </>
            )}
            <Field label="Estado" className="span-2">
              <select value={editing.estado} onChange={(e) => set("estado", e.target.value)}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </Field>
            <div className="form-actions span-2">
              <button type="button" className="button button--ghost" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="button button--primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Eliminar usuario"
        message={`¿Seguro que quieres eliminar a ${deleting?.nombres} ${deleting?.apellidos}? Si ya tiene asistencias o capacitaciones registradas, se inhabilitará en vez de eliminarse.`}
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
      />
    </>
  );
}
