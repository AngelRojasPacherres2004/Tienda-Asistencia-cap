import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ExcelJS from "exceljs";
import { Download, Edit3, Eye, FileSpreadsheet, FileUp, Trash2, Upload, UsersRound } from "lucide-react";
import { api, downloadFile, todayISO } from "../lib/api";
import {
  ConfirmDialog, EmptyState, Field, Loading, Modal, Notice, PageHeader, SearchInput, StatusBadge, SuccessDialog,
} from "../components/UI";

const roleLabels = { gerencia_general: "Gerencia general", gerente_comercial: "Gerente comercial", coach: "Coach", jefe_zonal: "Jefe zonal", jefe_tienda: "Jefe de tienda", asistente_tienda: "Asistente de tienda", jefe_seguridad: "Jefe de seguridad", jefe_area: "Jefe de área", seguridad: "Seguridad", caja: "Caja", almacenero: "Almacenero", vendedor: "Vendedor", asistente: "Asistente", trabajador: "Trabajador" };
const rolesByManager = { gerencia_general: ["gerente_comercial", "coach"], gerente_comercial: ["jefe_zonal"], jefe_zonal: ["jefe_tienda"], jefe_tienda: ["asistente_tienda", "jefe_seguridad", "jefe_area", "seguridad", "caja", "almacenero", "vendedor", "asistente", "trabajador"], asistente_tienda: ["jefe_seguridad", "jefe_area", "seguridad", "caja", "almacenero", "vendedor", "asistente", "trabajador"] };
const weekDays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const blankSchedule = () => weekDays.map((_, index) => ({ dia_semana: index + 1, trabaja: false, hora_entrada: "", hora_salida: "" }));
const blank = {
  nombres: "", apellidos: "", dni: "", tipo_documento: "dni", usuario: "", password: "",
  telefono: "", email: "", rol: "trabajador", tienda_id: "", tienda_ids: [], estado: "activo", fecha_ingreso: todayISO(), fecha_salida: "",
  cluster_id: "", fecha_nacimiento: "", sueldo: "", sexo: "", nacionalidad: "", direccion: "", distrito: "", area_laboral: "", carrera: "", grado_academico: "",
  ciclo_semestre: "", estado_civil: "", numero_hijos: "", talla_zapatillas: "", talla_polo: "",
  contacto_emergencia: "", telefono_emergencia: "", alergia: "", condicion_salud: "", motivo_salida: "",
  regimen_jornada: "", tipo_turno: "", tiene_parentesco: false, tipo_parentesco: "", familiar_vinculo: "", horarios: blankSchedule(),
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
  const isStoreAdmin = user?.rol === "jefe_tienda";
  const availableRoles = rolesByManager[user?.rol] || [];
  const [items, setItems] = useState(null);
  const [tiendas, setTiendas] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const importInput = useRef(null);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [workerFile, setWorkerFile] = useState(null);
  const [warningForm, setWarningForm] = useState({ tipo: "verbal", motivo: "", fecha: todayISO() });
  const [errorForm, setErrorForm] = useState({ categoria: "Operativo", descripcion: "", accion_correctiva: "", fecha: todayISO() });
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

  const filtered = useMemo(() => (items || []).filter((item) => (statusFilter === "todos" || item.estado === statusFilter) &&
    [item.nombres, item.apellidos, item.dni, item.usuario, item.tienda_nombre]
      .join(" ").toLowerCase().includes(search.toLowerCase()),
  ), [items, search, statusFilter]);

  const clearErrors = () => { setFormError(""); setFieldErrors({}); };
  const closeEditor = () => { setEditing(null); clearErrors(); };
  const openNew = () => { clearErrors(); setEditing({ ...blank, horarios: blankSchedule(), rol: availableRoles[0] || "trabajador", fecha_ingreso: todayISO() }); };
  const openEdit = (item) => {
    clearErrors();
    const savedSchedule = new Map((item.horarios || []).map((row) => [Number(row.dia_semana), row]));
    setEditing({ ...item, tipo_documento: item.tipo_documento || "dni", tienda_id: item.tienda_id || "", cluster_id: item.cluster_id || "", password: "", horarios: blankSchedule().map((row) => {
      const saved = savedSchedule.get(row.dia_semana) || {};
      return { ...row, ...saved, hora_entrada: saved.hora_entrada?.slice(0, 5) || "", hora_salida: saved.hora_salida?.slice(0, 5) || "" };
    }) });
  };
  const openView = async (item) => {
    setViewing(item); setWorkerFile(null); setWarningForm({ tipo: "verbal", motivo: "", fecha: todayISO() });
    setErrorForm({ categoria: "Operativo", descripcion: "", accion_correctiva: "", fecha: todayISO() });
    try {
      const [training, warnings, errors] = await Promise.all([api(`/capacitaciones/trabajadores/${item.id}`), api("/amonestaciones"), api("/errores-personal")]);
      setWorkerFile({ training, warnings: warnings.filter((row) => Number(row.usuario_id) === Number(item.id)), errors: errors.filter((row) => Number(row.usuario_id) === Number(item.id)) });
    } catch (err) { setWorkerFile({ error: err.message, training: null, warnings: [], errors: [] }); }
  };
  const saveWarning = async (event) => {
    event.preventDefault();
    if (!warningForm.motivo.trim()) return;
    setBusy(true);
    try { await api("/amonestaciones", { method: "POST", body: { ...warningForm, usuario_id: viewing.id } }); await openView(viewing); }
    catch (err) { setWorkerFile((current) => ({ ...(current || {}), error: err.message })); }
    finally { setBusy(false); }
  };
  const saveWorkerError = async (event) => {
    event.preventDefault();
    if (!errorForm.categoria.trim() || !errorForm.descripcion.trim()) return;
    setBusy(true);
    try { await api("/errores-personal", { method: "POST", body: { ...errorForm, usuario_id: viewing.id } }); await openView(viewing); }
    catch (err) { setWorkerFile((current) => ({ ...(current || {}), error: err.message })); }
    finally { setBusy(false); }
  };
  const set = (field, value) => {
    setEditing((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  };
  const setSchedule = (day, field, value) => {
    setEditing((current) => ({
      ...current,
      horarios: current.horarios.map((row) => row.dia_semana === day
        ? { ...row, [field]: value, ...(field === "trabaja" && !value ? { hora_entrada: "", hora_salida: "" } : {}) }
        : row),
    }));
    setFieldErrors((current) => ({ ...current, horarios: "" }));
  };

  const save = async (event) => {
    event.preventDefault();
    clearErrors();
    const errors = {};
    for (const field of ["nombres", "apellidos", "dni", "fecha_ingreso"]) {
      if (!String(editing[field] ?? "").trim()) errors[field] = "Este campo es obligatorio.";
    }
    if (!["gerencia_general", "gerente_comercial", "coach", "jefe_zonal"].includes(editing.rol) && !editing.tienda_id && isCentral) errors.tienda_id = "Selecciona una tienda.";
    if (user?.rol === "gerente_comercial" && editing.rol === "jefe_zonal" && !editing.cluster_id) errors.cluster_id = "Selecciona un clúster.";
    if (editing.nombres && editing.nombres.trim().length < 2) errors.nombres = "Ingresa al menos 2 caracteres.";
    if (editing.apellidos && editing.apellidos.trim().length < 2) errors.apellidos = "Ingresa al menos 2 caracteres.";
    const documentLength = editing.tipo_documento === "ce" ? 9 : 8;
    if (editing.dni && !new RegExp(`^\\d{${documentLength}}$`).test(editing.dni)) errors.dni = `Debe tener exactamente ${documentLength} dígitos.`;
    if (editing.telefono && !/^\d{9}$/.test(editing.telefono)) errors.telefono = "Debe tener exactamente 9 dígitos.";
    if (editing.telefono_emergencia && !/^\d{9}$/.test(editing.telefono_emergencia)) errors.telefono_emergencia = "Debe tener exactamente 9 dígitos.";
    if (editing.usuario && (editing.usuario.trim().length < 3 || !/^[a-z0-9._-]+$/i.test(editing.usuario.trim()))) errors.usuario = "Usa al menos 3 caracteres: letras, números, punto o guion.";
    if (editing.password && editing.password.length < 6) errors.password = "Debe tener al menos 6 caracteres.";
    if (editing.fecha_salida && !String(editing.motivo_salida || "").trim()) errors.motivo_salida = "Indica el motivo de salida.";
    if (editing.tiene_parentesco && !String(editing.tipo_parentesco || "").trim()) errors.tipo_parentesco = "Selecciona el parentesco.";
    if (editing.tiene_parentesco && !String(editing.familiar_vinculo || "").trim()) errors.familiar_vinculo = "Indica el nombre del familiar o vínculo.";
    if ((editing.horarios || []).some((row) => row.trabaja && (!row.hora_entrada || !row.hora_salida))) errors.horarios = "Completa la entrada y salida de todos los días trabajados.";
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    setBusy(true);
    try {
      const payload = { ...editing, estado: editing.fecha_salida ? "inactivo" : editing.estado, tienda_id: ["gerencia_general", "gerente_comercial", "coach", "jefe_zonal"].includes(editing.rol) ? null : Number(editing.tienda_id) || null };
      if (!payload.password) delete payload.password;
      await api(editing.id ? `/usuarios/${editing.id}` : "/usuarios", {
        method: editing.id ? "PUT" : "POST", body: payload,
      });
      closeEditor();
      await Promise.all([load(), loadClusters()]);
      setSuccess({ title: editing.id ? "Usuario actualizado" : "Usuario creado", message: editing.id ? "Los cambios del usuario se guardaron correctamente." : "El nuevo usuario fue registrado correctamente." });
    } catch (err) {
      const message = err.message || "No se pudo guardar el usuario.";
      if (/DNI|CE|documento/i.test(message)) setFieldErrors({ dni: message });
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
      const required = ["nombres", "apellidos", "dni", "fecha_ingreso"];
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
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="todos">Todos los estados</option><option value="activo">Activos</option><option value="inactivo">Inactivos</option></select>
        <span>{filtered.length} usuarios</span>
      </div>

      {!items ? <Loading /> : filtered.length ? (
        <div className="table-panel">
          <div className={`data-table ${isCentral ? "data-table--usuarios" : "data-table--usuarios-tienda"}`}>
            <div className="data-table__head">
              <span>Persona</span><span>DNI</span><span>Usuario</span><span>Teléfono</span>
              {isCentral && <><span>Rol</span><span>Tienda / clúster</span></>}
              {!isCentral && <span>Rol</span>}
              <span>Estado</span><span />
            </div>
            {filtered.map((item) => (
              <div className="data-table__row" key={item.id}>
                <div className="person-cell">
                  <span className="avatar">{item.nombres.charAt(0).toUpperCase()}</span>
                  <div><button className="person-link" onClick={() => openView(item)}>{item.nombres} {item.apellidos}</button><small>{item.usuario ? `@${item.usuario}` : "Sin acceso al sistema"}</small></div>
                </div>
                <span className="mono">{item.dni}</span>
                <span className="cell-primary">{item.usuario || "Sin acceso"}</span>
                <span>{item.telefono || "—"}</span>
                {!isCentral && <span className="personnel-role">{roleLabels[item.rol] || item.rol?.replaceAll("_", " ") || "Sin rol"}</span>}
                {isCentral && <>
                  <span className={`role role--${item.rol}`}>{roleLabels[item.rol]}</span>
                  <span>{item.rol === "jefe_zonal" ? (item.cluster_nombre || "Sin clúster") : (item.tienda_nombre || "—")}</span>
                </>}
                <span><StatusBadge value={item.estado} /></span>
                <div className="row-actions">
                  <button onClick={() => openView(item)} aria-label="Ver ficha"><Eye size={15} /></button>
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
        wide
        title={editing?.id ? "Editar usuario" : "Nuevo usuario"}
        subtitle="Los campos marcados son obligatorios."
        onClose={closeEditor}
      >
        {editing && (
          <form className="form-grid" onSubmit={save} noValidate>
            {formError && <div className="span-2"><Notice type="error" onClose={() => setFormError("")}>{formError}</Notice></div>}
            <Field label="Nombres" error={fieldErrors.nombres}><input required value={editing.nombres} onChange={(e) => set("nombres", e.target.value)} /></Field>
            <Field label="Apellidos" error={fieldErrors.apellidos}><input required value={editing.apellidos} onChange={(e) => set("apellidos", e.target.value)} /></Field>
            <Field label="Tipo de documento"><select value={editing.tipo_documento || "dni"} onChange={(e) => { set("tipo_documento", e.target.value); set("dni", ""); }}><option value="dni">DNI</option><option value="ce">Carné de extranjería (CE)</option></select></Field>
            <Field label={editing.tipo_documento === "ce" ? "Número de CE" : "Número de DNI"} error={fieldErrors.dni} hint={`${editing.tipo_documento === "ce" ? 9 : 8} dígitos`}><input required inputMode="numeric" maxLength={editing.tipo_documento === "ce" ? 9 : 8} value={editing.dni} onChange={(e) => set("dni", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Teléfono" error={fieldErrors.telefono} hint="9 dígitos, opcional"><input maxLength={9} value={editing.telefono} onChange={(e) => set("telefono", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Correo" hint="Se usa para notificaciones de incidencias"><input type="email" value={editing.email || ""} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Usuario" error={fieldErrors.usuario} hint="Opcional. Sin usuario no podrá iniciar sesión."><input value={editing.usuario || ""} onChange={(e) => set("usuario", e.target.value)} /></Field>
            <Field label={editing.id ? "Nueva contraseña" : "Contraseña"} error={fieldErrors.password} hint={editing.id ? "Déjala vacía para conservar la actual." : "Opcional; mínimo 6 caracteres si se asigna."}>
              <input type="password" value={editing.password} onChange={(e) => set("password", e.target.value)} />
            </Field>
            <Field label="Fecha de ingreso" error={fieldErrors.fecha_ingreso}><input required type="date" value={editing.fecha_ingreso || ""} onChange={(e) => set("fecha_ingreso", e.target.value)} /></Field>
            <Field label="Fecha de nacimiento"><input type="date" max={todayISO()} value={editing.fecha_nacimiento || ""} onChange={(e) => set("fecha_nacimiento", e.target.value)} /></Field>
            <Field label="Edad" hint="Se calcula según la fecha de nacimiento"><input readOnly value={editing.fecha_nacimiento ? Math.max(0, Math.floor((Date.now() - new Date(`${editing.fecha_nacimiento}T12:00:00`).getTime()) / 31557600000)) : ""} /></Field>
            <Field label="Sueldo"><input type="number" min="0" step="0.01" placeholder="0,00" value={editing.sueldo ?? ""} onChange={(e) => set("sueldo", e.target.value)} /></Field>
            <Field label="Fecha de salida" error={fieldErrors.fecha_salida} hint={editing.id ? "Al guardarla, el trabajador quedará inactivo." : "Se registra únicamente al editar al trabajador."}><input type="date" disabled={!editing.id} min={editing.fecha_ingreso || undefined} value={editing.fecha_salida || ""} onChange={(e) => { set("fecha_salida", e.target.value); if (e.target.value) set("estado", "inactivo"); else set("motivo_salida", ""); }} /></Field>
            <Field label="Motivo de salida" error={fieldErrors.motivo_salida}><input required={Boolean(editing.fecha_salida)} disabled={!editing.id || !editing.fecha_salida} placeholder="Indica el motivo de la salida" value={editing.motivo_salida || ""} onChange={(e) => set("motivo_salida", e.target.value)} /></Field>
            {availableRoles.length > 0 && (
              <>
                <Field label="Rol">
                  <select value={editing.rol} onChange={(e) => set("rol", e.target.value)}>
                    {availableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                  </select>
                </Field>
                {!isStoreAdmin && editing.rol !== "jefe_zonal" && <Field label="Tienda" error={fieldErrors.tienda_id}>
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
            <Field label="Sexo"><select value={editing.sexo || "no_especificado"} onChange={(e) => set("sexo", e.target.value)}><option value="no_especificado">Sin especificar</option><option value="hombre">Hombre</option><option value="mujer">Mujer</option></select></Field>
            <Field label="Mes de cumpleaños"><input readOnly value={editing.fecha_nacimiento ? new Intl.DateTimeFormat("es-PE", { month: "long", timeZone: "UTC" }).format(new Date(`${editing.fecha_nacimiento}T12:00:00Z`)) : ""} /></Field>
            <Field label="Nacionalidad"><input value={editing.nacionalidad || ""} onChange={(e) => set("nacionalidad", e.target.value)} /></Field>
            <Field label="Teléfono de emergencia" error={fieldErrors.telefono_emergencia}><input maxLength={9} value={editing.telefono_emergencia || ""} onChange={(e) => set("telefono_emergencia", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Contacto de emergencia" hint="Nombres y apellidos"><input value={editing.contacto_emergencia || ""} onChange={(e) => set("contacto_emergencia", e.target.value)} /></Field>
            <Field label="Distrito"><input value={editing.distrito || ""} onChange={(e) => set("distrito", e.target.value)} /></Field>
            <Field label="Dirección" className="span-2"><textarea rows={2} value={editing.direccion || ""} onChange={(e) => set("direccion", e.target.value)} /></Field>
            <Field label="Nivel de estudio"><select value={editing.grado_academico || "sin_especificar"} onChange={(e) => { set("grado_academico", e.target.value); if (e.target.value !== "universitario") set("ciclo_semestre", ""); }}><option value="sin_especificar">Sin especificar</option><option value="primaria">Primaria</option><option value="secundaria">Secundaria</option><option value="tecnico">Técnico</option><option value="universitario">Universitario</option>{!isStoreAdmin && <option value="postgrado">Posgrado</option>}</select></Field>
            {editing.grado_academico === "universitario" && <Field label="Ciclo / semestre"><input placeholder="Ej. 8vo ciclo" value={editing.ciclo_semestre || ""} onChange={(e) => set("ciclo_semestre", e.target.value)} /></Field>}
            {!isStoreAdmin && <Field label="Área"><input placeholder="Ej. Caja, almacén o ventas" value={editing.area_laboral || ""} onChange={(e) => set("area_laboral", e.target.value)} /></Field>}
            <Field label="Carrera"><input placeholder="Carrera técnica o profesional" value={editing.carrera || ""} onChange={(e) => set("carrera", e.target.value)} /></Field>
            <Field label="Régimen / jornada"><select value={editing.regimen_jornada || ""} onChange={(e) => set("regimen_jornada", e.target.value)}><option value="">Sin especificar</option><option value="4h">4 horas</option><option value="8h">8 horas</option><option value="12h">12 horas</option></select></Field>
            <Field label="Tipo de turno"><select value={editing.tipo_turno || ""} onChange={(e) => set("tipo_turno", e.target.value)}><option value="">Sin especificar</option><option value="apertura">Apertura</option><option value="intermedio">Intermedio</option><option value="cierre">Cierre</option><option value="part_time">Part time</option></select></Field>
            <Field label="¿Tiene parentesco?"><select value={editing.tiene_parentesco ? "si" : "no"} onChange={(e) => { const hasRelationship = e.target.value === "si"; set("tiene_parentesco", hasRelationship); if (!hasRelationship) setEditing((current) => ({ ...current, tipo_parentesco: "", familiar_vinculo: "" })); }}><option value="no">No</option><option value="si">Sí</option></select></Field>
            {editing.tiene_parentesco && <>
              <Field label="Tipo de parentesco" error={fieldErrors.tipo_parentesco}><select required value={editing.tipo_parentesco || ""} onChange={(e) => set("tipo_parentesco", e.target.value)}><option value="">Selecciona</option><option value="padre_madre">Padre / madre</option><option value="hermano_hermana">Hermano / hermana</option><option value="conyuge_pareja">Cónyuge / pareja</option><option value="hijo_hija">Hijo / hija</option><option value="otro">Otro</option></select></Field>
              <Field label="Familiar / vínculo" error={fieldErrors.familiar_vinculo}><input required placeholder="Nombre completo" value={editing.familiar_vinculo || ""} onChange={(e) => set("familiar_vinculo", e.target.value)} /></Field>
            </>}
            <Field label="Estado civil"><select value={editing.estado_civil || "sin_especificar"} onChange={(e) => set("estado_civil", e.target.value)}><option value="sin_especificar">Sin especificar</option><option value="soltero">Soltero(a)</option><option value="casado">Casado(a)</option><option value="conviviente">Conviviente</option><option value="divorciado">Divorciado(a)</option><option value="viudo">Viudo(a)</option></select></Field>
            <Field label="Número de hijos"><input type="number" min="0" step="1" value={editing.numero_hijos ?? ""} onChange={(e) => set("numero_hijos", e.target.value)} /></Field>
            <Field label="Talla de zapatillas"><input type="number" min="0" step="0.5" value={editing.talla_zapatillas ?? ""} onChange={(e) => set("talla_zapatillas", e.target.value)} /></Field>
            <Field label="Talla de polo"><select value={editing.talla_polo || "sin_especificar"} onChange={(e) => set("talla_polo", e.target.value)}><option value="sin_especificar">Sin especificar</option>{["s", "m", "l", "xl", "xxl"].map((size) => <option key={size} value={size}>{size.toUpperCase()}</option>)}</select></Field>
            <Field label="Alergia" className="span-2"><textarea rows={2} maxLength={500} placeholder="Ej. Ninguna, o detalla la alergia" value={editing.alergia || ""} onChange={(e) => set("alergia", e.target.value)} /></Field>
            <Field label="Condición de salud" className="span-2" hint="Opcional. Registra tratamientos, restricciones o consideraciones médicas relevantes.">
              <textarea rows={3} maxLength={500} placeholder="Ej. Ninguna, tratamiento o consideración médica" value={editing.condicion_salud || ""} onChange={(e) => set("condicion_salud", e.target.value)} />
            </Field>
            <div className="form-section-title span-2"><strong>Horario semanal</strong><span>Marca los días trabajados y registra sus horas.</span></div>
            {fieldErrors.horarios && <div className="field-error span-2">{fieldErrors.horarios}</div>}
            <div className="weekly-schedule span-2">
              {editing.horarios.map((row, index) => <div className="weekly-schedule__row" key={row.dia_semana}>
                <strong>{weekDays[index]}</strong>
                <label className="schedule-check"><input type="checkbox" checked={Boolean(row.trabaja)} onChange={(e) => setSchedule(row.dia_semana, "trabaja", e.target.checked)} /> Trabaja</label>
                <input aria-label={`Entrada ${weekDays[index]}`} type="time" disabled={!row.trabaja} value={row.hora_entrada || ""} onChange={(e) => setSchedule(row.dia_semana, "hora_entrada", e.target.value)} />
                <input aria-label={`Salida ${weekDays[index]}`} type="time" disabled={!row.trabaja} value={row.hora_salida || ""} onChange={(e) => setSchedule(row.dia_semana, "hora_salida", e.target.value)} />
              </div>)}
            </div>
            <div className="form-actions span-2">
              <button type="button" className="button button--ghost" onClick={closeEditor}>Cancelar</button>
              <button className="button button--primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!viewing} extraWide className="worker-file-modal" title={viewing ? `Ficha de ${viewing.nombres} ${viewing.apellidos}` : "Ficha del trabajador"} subtitle="Datos, horario, amonestaciones, errores y capacitaciones" onClose={() => setViewing(null)}>
        {viewing && <div className="worker-file">
          {workerFile?.error && <Notice type="error">{workerFile.error}</Notice>}
          <section><h3>Datos personales</h3><dl><div><dt>Documento</dt><dd>{(viewing.tipo_documento || "dni").toUpperCase()} {viewing.dni}</dd></div><div><dt>Teléfono</dt><dd>{viewing.telefono || "—"}</dd></div><div><dt>Nacimiento</dt><dd>{viewing.fecha_nacimiento || "—"}</dd></div><div><dt>Nacionalidad</dt><dd>{viewing.nacionalidad || "—"}</dd></div><div><dt>Distrito</dt><dd>{viewing.distrito || "—"}</dd></div><div><dt>Dirección</dt><dd>{viewing.direccion || "—"}</dd></div></dl></section>
          <section><h3>Datos laborales</h3><dl><div><dt>Rol</dt><dd>{roleLabels[viewing.rol] || viewing.rol}</dd></div><div><dt>Área</dt><dd>{viewing.area_laboral || "—"}</dd></div><div><dt>Ingreso</dt><dd>{viewing.fecha_ingreso}</dd></div><div><dt>Nivel de estudio</dt><dd>{viewing.grado_academico?.replaceAll("_", " ") || "—"}</dd></div><div><dt>Carrera</dt><dd>{viewing.carrera || "—"}</dd></div><div><dt>Jornada / turno</dt><dd>{viewing.regimen_jornada?.toUpperCase() || "—"} · {viewing.tipo_turno?.replaceAll("_", " ") || "—"}</dd></div></dl></section>
          <section><h3>Horario semanal</h3>{viewing.horarios?.some((row) => row.trabaja) ? <div className="worker-schedule">{viewing.horarios.filter((row) => row.trabaja).map((row) => <div key={row.dia_semana}><strong>{weekDays[Number(row.dia_semana) - 1]}</strong><span>{row.hora_entrada?.slice(0, 5)} – {row.hora_salida?.slice(0, 5)}</span></div>)}</div> : <p>Sin horario registrado.</p>}</section>
          <section><h3>Amonestaciones</h3>{workerFile ? workerFile.warnings.length ? <div className="worker-file__list">{workerFile.warnings.map((row) => <div key={row.id}><strong>{row.tipo.replaceAll("_", " ")}</strong><span>{row.fecha}</span><p>{row.motivo}</p></div>)}</div> : <p>Sin amonestaciones registradas.</p> : <Loading />}
            {user.rol === "jefe_tienda" && <form className="worker-warning-form" onSubmit={saveWarning}><select value={warningForm.tipo} onChange={(e) => setWarningForm({ ...warningForm, tipo: e.target.value })}><option value="verbal">Verbal</option><option value="carta_amonestacion">Carta</option><option value="memorandum">Memorándum</option></select><input type="date" value={warningForm.fecha} onChange={(e) => setWarningForm({ ...warningForm, fecha: e.target.value })} /><input required placeholder="Motivo" value={warningForm.motivo} onChange={(e) => setWarningForm({ ...warningForm, motivo: e.target.value })} /><button className="button button--soft" disabled={busy}>Registrar amonestación</button></form>}
          </section>
          <section><h3>Errores de personal</h3>{workerFile ? workerFile.errors.length ? <div className="worker-file__list">{workerFile.errors.map((row) => <div key={row.id}><strong>{row.categoria}</strong><span>{row.fecha}</span><p>{row.descripcion}</p>{row.accion_correctiva && <small>Acción correctiva: {row.accion_correctiva}</small>}</div>)}</div> : <p>Sin errores registrados.</p> : <Loading />}
            {user.rol === "jefe_tienda" && <form className="worker-error-form" onSubmit={saveWorkerError}><input required placeholder="Categoría" value={errorForm.categoria} onChange={(e) => setErrorForm({ ...errorForm, categoria: e.target.value })} /><input type="date" value={errorForm.fecha} onChange={(e) => setErrorForm({ ...errorForm, fecha: e.target.value })} /><input required placeholder="Descripción del error" value={errorForm.descripcion} onChange={(e) => setErrorForm({ ...errorForm, descripcion: e.target.value })} /><input placeholder="Acción correctiva" value={errorForm.accion_correctiva} onChange={(e) => setErrorForm({ ...errorForm, accion_correctiva: e.target.value })} /><button className="button button--soft" disabled={busy}>Registrar error</button></form>}
          </section>
          <section><h3>Capacitaciones</h3>{workerFile?.training ? <div className="worker-file__list">{workerFile.training.cursos.map((course) => <div key={course.curso_id}><strong>{course.titulo}</strong><span>{course.estado.replaceAll("_", " ")}</span></div>)}</div> : <Loading />}</section>
        </div>}
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
