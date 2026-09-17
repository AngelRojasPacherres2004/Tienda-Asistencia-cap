import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ExcelJS from "exceljs";
import { Download, Edit3, FileSpreadsheet, FileUp, Trash2, Upload, UsersRound } from "lucide-react";
import { api, downloadFile, todayISO } from "../lib/api";
import {
  ConfirmDialog, EmptyState, Field, Loading, Modal, Notice, PageHeader, SearchInput, StatusBadge, SuccessDialog,
} from "../components/UI";

const roleLabels = { gerencia_general: "Gerencia general", gerente_comercial: "Gerente comercial", coach: "Coach", jefe_zonal: "Jefe zonal", jefe_tienda: "Administrador de tienda", asistente_tienda: "Asistente de tienda", trabajador: "Trabajador", seguridad: "Seguridad" };
const rolesByManager = { gerencia_general: ["gerente_comercial", "coach"], gerente_comercial: ["jefe_zonal"], jefe_zonal: ["jefe_tienda"], jefe_tienda: ["asistente_tienda", "trabajador", "seguridad"], asistente_tienda: ["trabajador", "seguridad"] };
const blank = {
  nombres: "", apellidos: "", dni: "", usuario: "", password: "",
  telefono: "", email: "", rol: "trabajador", tienda_id: "", tienda_ids: [], estado: "activo", fecha_ingreso: todayISO(), fecha_salida: "",
  cluster_id: "",
};

const excelFields = {
  nombres: "nombres", apellidos: "apellidos", dni: "dni", usuario: "usuario",
  contrasena: "password", password: "password", telefono: "telefono", fechaingreso: "fecha_ingreso",
};
const normalizeHeader = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
const excelDate = (value) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return new Date(Date.UTC(1899, 11, 30 + value)).toISOString().slice(0, 10);
  return String(value || "").trim().slice(0, 10);
};

export default function Usuarios({ user }) {
  const isCentral = ["gerencia_general", "gerente_comercial", "coach", "jefe_zonal"].includes(user?.rol);
  const availableRoles = rolesByManager[user?.rol] || [];
  const [items, setItems] = useState(null);
  const [tiendas, setTiendas] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const importInput = useRef(null);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState(null);
  const fileRef = useRef(null);

  const load = () => api("/usuarios").then(setItems).catch((err) => setNotice({ type: "error", text: err.message }));
  const loadTiendas = useCallback(
    () => (isCentral ? api("/tiendas").then(setTiendas).catch(() => {}) : Promise.resolve()),
    [isCentral],
  );
  const loadClusters = useCallback(
    () => (user?.rol === "gerente_comercial" ? api("/clusters").then(setClusters).catch(() => {}) : Promise.resolve()),
    [user?.rol],
  );
  useEffect(() => { load(); loadTiendas(); loadClusters(); }, [loadTiendas, loadClusters]);

  const filtered = useMemo(() => (items || []).filter((item) =>
    [item.nombres, item.apellidos, item.dni, item.usuario, item.tienda_nombre]
      .join(" ").toLowerCase().includes(search.toLowerCase()),
  ), [items, search]);

  const clearErrors = () => { setFormError(""); setFieldErrors({}); };
  const closeEditor = () => { setEditing(null); clearErrors(); };
  const openNew = () => { clearErrors(); setEditing({ ...blank, rol: availableRoles[0] || "trabajador", fecha_ingreso: todayISO() }); };
  const openEdit = (item) => { clearErrors(); setEditing({ ...item, tienda_id: item.tienda_id || "", cluster_id: item.cluster_id || "", password: "" }); };
  const set = (field, value) => {
    setEditing((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  };

  const save = async (event) => {
    event.preventDefault();
    clearErrors();
    const errors = {};
    for (const field of ["nombres", "apellidos", "dni", "usuario", "fecha_ingreso"]) {
      if (!String(editing[field] ?? "").trim()) errors[field] = "Este campo es obligatorio.";
    }
    if (!editing.id && !["trabajador", "seguridad"].includes(editing.rol) && !editing.password) errors.password = "Este campo es obligatorio para este rol.";
    if (!["gerencia_general", "gerente_comercial", "coach", "jefe_zonal"].includes(editing.rol) && !editing.tienda_id && isCentral) errors.tienda_id = "Selecciona una tienda.";
    if (user?.rol === "gerente_comercial" && editing.rol === "jefe_zonal" && !editing.cluster_id) errors.cluster_id = "Selecciona un clúster.";
    if (editing.nombres && editing.nombres.trim().length < 2) errors.nombres = "Ingresa al menos 2 caracteres.";
    if (editing.apellidos && editing.apellidos.trim().length < 2) errors.apellidos = "Ingresa al menos 2 caracteres.";
    if (editing.dni && !/^\d{8}$/.test(editing.dni)) errors.dni = "Debe tener exactamente 8 dígitos.";
    if (editing.telefono && !/^\d{9}$/.test(editing.telefono)) errors.telefono = "Debe tener exactamente 9 dígitos.";
    if (editing.usuario && (editing.usuario.trim().length < 3 || !/^[a-z0-9._-]+$/i.test(editing.usuario.trim()))) errors.usuario = "Usa al menos 3 caracteres: letras, números, punto o guion.";
    if (editing.password && editing.password.length < 6) errors.password = "Debe tener al menos 6 caracteres.";
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    setBusy(true);
    try {
      const payload = { ...editing, tienda_id: ["gerencia_general", "gerente_comercial", "coach", "jefe_zonal"].includes(editing.rol) ? null : Number(editing.tienda_id) || null };
      if (!payload.password) delete payload.password;
      await api(editing.id ? `/usuarios/${editing.id}` : "/usuarios", {
        method: editing.id ? "PUT" : "POST", body: payload,
      });
      closeEditor();
      await Promise.all([load(), loadClusters()]);
      setSuccess({ title: editing.id ? "Usuario actualizado" : "Usuario creado", message: editing.id ? "Los cambios del usuario se guardaron correctamente." : "El nuevo usuario fue registrado correctamente." });
    } catch (err) {
      const message = err.message || "No se pudo guardar el usuario.";
      if (/DNI/i.test(message)) setFieldErrors({ dni: message });
      else if (/nombre de usuario|usuario.*registrado/i.test(message)) setFieldErrors({ usuario: message });
      else if (/nombres y apellidos/i.test(message)) setFieldErrors({ nombres: message, apellidos: message });
      else if (/contrase/i.test(message)) setFieldErrors({ password: message });
      else if (/tel[eé]fono/i.test(message)) setFieldErrors({ telefono: message });
      else if (/fecha de ingreso/i.test(message)) setFieldErrors({ fecha_ingreso: message });
      else if (/fecha de salida/i.test(message)) setFieldErrors({ fecha_salida: message });
      else if (/tienda/i.test(message)) setFieldErrors({ tienda_id: message });
      else if (/cl[uú]ster/i.test(message)) setFieldErrors({ cluster_id: message });
      else setFormError(message);
    } finally {
      setBusy(false);
    }
  };

  const downloadUsers = async (template = false) => {
    setBusy(true); setFormError("");
    try { await downloadFile(`/api/usuarios/export.xlsx${template ? "?plantilla=1" : ""}`, template ? "plantilla-usuarios.xlsx" : "usuarios-mi-tienda.xlsx"); }
    catch (err) { setNotice({ type: "error", text: err.message }); }
    finally { setBusy(false); }
  };

  const importExcel = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true); setNotice(null);
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error("El archivo no contiene ninguna hoja.");
      const headers = {};
      sheet.getRow(1).eachCell((cell, column) => { const field = excelFields[normalizeHeader(cell.value)]; if (field) headers[column] = field; });
      const required = ["nombres", "apellidos", "dni", "usuario", "fecha_ingreso"];
      if (required.some((field) => !Object.values(headers).includes(field))) throw new Error("El Excel no tiene todas las columnas requeridas. Descarga y utiliza la plantilla.");
      const usuarios = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const data = {};
        Object.entries(headers).forEach(([column, field]) => { data[field] = row.getCell(Number(column)).value ?? ""; });
        if (!Object.values(data).some((value) => String(value).trim())) return;
        data.dni = String(data.dni).padStart(8, "0");
        data.telefono = data.telefono ? String(data.telefono) : "";
        data.fecha_ingreso = excelDate(data.fecha_ingreso);
        usuarios.push(data);
      });
      const result = await api("/usuarios/importar", { method: "POST", body: { usuarios } });
      await load();
      setSuccess({
        title: result.creados ? "Usuarios importados" : "No había usuarios nuevos",
        message: `Se crearon ${result.creados} usuario(s) y se omitieron ${result.omitidos} que ya estaban registrados.`,
      });
    } catch (err) { setNotice({ type: "error", text: err.message }); }
    finally { setBusy(false); }
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

  const downloadUsersAdmin = (template = false) => downloadFile(`/api/usuarios/export.xlsx${template ? "?plantilla=1" : ""}`, template ? "plantilla-usuarios.xlsx" : "usuarios.xlsx")
    .catch((err) => setNotice({ type: "error", text: err.message }));

  const importUsersAdmin = async (event) => {
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
          rol: String(value(row, "rol") || "trabajador").trim().toLowerCase().replaceAll(" ", "_"),
          tienda_id: tienda?.id || (isCentral ? "" : user.tienda_id), estado: String(value(row, "estado") || "activo").trim().toLowerCase(),
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
  const clusterOptions = clusters.filter((cluster) =>
    cluster.estado === "activo"
    && (!cluster.jefe_zonal_id || String(cluster.jefe_zonal_id) === String(editing?.id)),
  );

  return (
    <>
      <PageHeader
        eyebrow={isCentral ? "Jerarquía" : "Mi tienda"}
        title="Usuarios a mi cargo"
        subtitle="Solo puedes administrar los rangos autorizados debajo de tu cargo."
        action={<div className="header-actions">
          {isCentral ? <>
            <button className="button button--ghost" onClick={() => downloadUsersAdmin(true)}><Download size={15} />Plantilla</button>
            <button className="button button--ghost" onClick={() => importInput.current?.click()} disabled={busy}><FileUp size={15} />Importar Excel</button>
            <button className="button button--soft" onClick={() => downloadUsersAdmin()}><Download size={15} />Exportar Excel</button>
            <input ref={importInput} type="file" accept=".xlsx" onChange={importUsersAdmin} hidden />
          </> : <>
            <button className="button button--ghost" disabled={busy} onClick={() => downloadUsers(false)}><Download size={16} />Exportar Excel</button>
            <button className="button button--ghost" disabled={busy} onClick={() => downloadUsers(true)}><FileSpreadsheet size={16} />Descargar plantilla</button>
            <button className="button button--soft" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16} />Importar Excel</button>
            <input ref={fileRef} className="visually-hidden" type="file" accept=".xlsx" onChange={importExcel} />
          </>}
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
          <div className={`data-table ${isCentral ? "data-table--usuarios" : "data-table--usuarios-tienda"}`}>
            <div className="data-table__head">
              <span>Persona</span><span>DNI</span><span>Usuario</span><span>Teléfono</span>
              {isCentral && <><span>Rol</span><span>Tienda / clúster</span></>}
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
                {isCentral && <>
                  <span className={`role role--${item.rol}`}>{roleLabels[item.rol]}</span>
                  <span>{item.rol === "jefe_zonal" ? (item.cluster_nombre || "Sin clúster") : (item.tienda_nombre || "—")}</span>
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
        onClose={closeEditor}
      >
        {editing && (
          <form className="form-grid" onSubmit={save} noValidate>
            {formError && <div className="span-2"><Notice type="error" onClose={() => setFormError("")}>{formError}</Notice></div>}
            <Field label="Nombres" error={fieldErrors.nombres}><input required value={editing.nombres} onChange={(e) => set("nombres", e.target.value)} /></Field>
            <Field label="Apellidos" error={fieldErrors.apellidos}><input required value={editing.apellidos} onChange={(e) => set("apellidos", e.target.value)} /></Field>
            <Field label="DNI" error={fieldErrors.dni}><input required maxLength={8} value={editing.dni} onChange={(e) => set("dni", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Teléfono" error={fieldErrors.telefono} hint="9 dígitos, opcional"><input maxLength={9} value={editing.telefono} onChange={(e) => set("telefono", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Correo" hint="Se usa para notificaciones de incidencias"><input type="email" value={editing.email || ""} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Usuario" error={fieldErrors.usuario}><input required value={editing.usuario} onChange={(e) => set("usuario", e.target.value)} /></Field>
            <Field label={editing.id ? "Nueva contraseña" : "Contraseña"} error={fieldErrors.password} hint={editing.id ? "Déjala vacía para conservar la actual." : "Obligatoria para roles de gestión; mínimo 6 caracteres."}>
              <input required={!editing.id && !["trabajador", "seguridad"].includes(editing.rol)} type="password" value={editing.password} onChange={(e) => set("password", e.target.value)} />
            </Field>
            <Field label="Fecha de ingreso" error={fieldErrors.fecha_ingreso}><input required type="date" value={editing.fecha_ingreso || ""} onChange={(e) => set("fecha_ingreso", e.target.value)} /></Field>
            <Field label="Fecha de salida" error={fieldErrors.fecha_salida} hint="Se deja en blanco al crear el usuario."><input type="date" disabled={!editing.id} min={editing.fecha_ingreso || undefined} value={editing.fecha_salida || ""} onChange={(e) => set("fecha_salida", e.target.value)} /></Field>
            {availableRoles.length > 0 && (
              <>
                <Field label="Rol">
                  <select value={editing.rol} onChange={(e) => set("rol", e.target.value)}>
                    {availableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                  </select>
                </Field>
                {editing.rol !== "jefe_zonal" && <Field label="Tienda" error={fieldErrors.tienda_id}>
                  <select required={isCentral} disabled={!isCentral} value={editing.tienda_id} onChange={(e) => set("tienda_id", e.target.value)}>
                    <option value="">Selecciona una tienda</option>
                    {tiendaOptions.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </Field>}
                {user?.rol === "gerente_comercial" && editing.rol === "jefe_zonal" && (
                  <Field label="Clúster asignado" error={fieldErrors.cluster_id} hint="Cada zonal puede estar a cargo de un solo clúster.">
                    <select required value={editing.cluster_id || ""} onChange={(e) => set("cluster_id", e.target.value)}>
                      <option value="">Selecciona un clúster</option>
                      {clusterOptions.map((cluster) => <option key={cluster.id} value={cluster.id}>{cluster.nombre} ({cluster.codigo})</option>)}
                    </select>
                  </Field>
                )}
              </>
            )}
            <Field label="Estado" className="span-2">
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

      <ConfirmDialog
        open={!!deleting}
        title="Eliminar usuario"
        message={`¿Seguro que quieres eliminar a ${deleting?.nombres} ${deleting?.apellidos}? Si ya tiene asistencias o capacitaciones registradas, se inhabilitará en vez de eliminarse.`}
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
      />
      <SuccessDialog open={!!success} title={success?.title} message={success?.message} onContinue={() => setSuccess(null)} />
    </>
  );
}
