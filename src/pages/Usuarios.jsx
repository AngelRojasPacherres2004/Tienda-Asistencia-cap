import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ExcelJS from "exceljs";
import { Download, Edit3, FileSpreadsheet, FileUp, Trash2, Upload, UsersRound } from "lucide-react";
import { api, downloadFile, todayISO } from "../lib/api";
import {
  ConfirmDialog, EmptyState, Field, Loading, Modal, Notice, PageHeader, SearchInput, StatusBadge, SuccessDialog,
} from "../components/UI";

const roleLabels = { admin: "Administrador", jefe_zonal: "Jefe zonal", administrador_tienda: "Administrador de tienda", jefe_tienda: "Líder de equipo", empleado: "Empleado", vendedor: "Vendedor", seguridad: "Seguridad", coach: "Coach" };
const personalRoleLabels = { administrador: "Administrador", operante: "Operante", lider_equipo: "Líder de equipo", otros: "Otros" };
const databaseRoleLabels = { jefe_zonal: "Jefe zonal", administrador_tienda: "Administrador de tienda", coach: "Coach" };
const personalRoleByAccessRole = { admin: "administrador", jefe_zonal: "administrador", administrador_tienda: "administrador", jefe_tienda: "lider_equipo", empleado: "operante" };
const blank = {
  nombres: "", apellidos: "", dni: "", usuario: "", password: "", codigo_vendedor: "",
  telefono: "", rol: "jefe_zonal", tienda_id: "", estado: "activo", fecha_ingreso: todayISO(), fecha_salida: "", motivo_salida: "",
  fecha_nacimiento: "", sueldo: "", rol_personal: "administrador", sexo: "no_especificado",
  telefono_emergencia: "", distrito: "", direccion: "", grado_academico: "sin_especificar",
  ciclo_semestre: "", estado_civil: "sin_especificar", numero_hijos: 0,
  talla_zapatillas: "", talla_polo: "sin_especificar", condicion_salud: "",
};

const calculateAge = (birthDate) => {
  if (!birthDate) return "";
  const birth = new Date(`${birthDate}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : "";
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
  const isAdmin = user?.rol === "admin";
  const isMainAdmin = user?.rol_db === "admin";
  const isStoreAdmin = user?.rol_db === "administrador_tienda";
  const [items, setItems] = useState(null);
  const [tiendas, setTiendas] = useState([]);
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
    () => (isAdmin ? api("/tiendas").then(setTiendas).catch(() => {}) : Promise.resolve()),
    [isAdmin],
  );
  useEffect(() => { load(); loadTiendas(); }, [loadTiendas]);

  const filtered = useMemo(() => (items || []).filter((item) =>
    [item.nombres, item.apellidos, item.dni, item.usuario, item.tienda_nombre]
      .join(" ").toLowerCase().includes(search.toLowerCase()),
  ), [items, search]);

  const clearErrors = () => { setFormError(""); setFieldErrors({}); };
  const closeEditor = () => { setEditing(null); clearErrors(); };
  const openNew = () => {
    clearErrors();
    setEditing({
      ...blank, fecha_ingreso: todayISO(),
      rol: isMainAdmin ? "jefe_zonal" : isStoreAdmin ? "empleado" : "administrador_tienda",
      rol_personal: isStoreAdmin ? "operante" : "administrador",
      tienda_id: isStoreAdmin ? user.tienda_id : "",
    });
  };
  const openEdit = (item) => {
    clearErrors();
    setEditing({
      ...blank, ...item, tienda_id: item.tienda_id || "", password: "",
      rol_personal: item.rol_personal || personalRoleByAccessRole[item.rol] || "otros",
    });
  };
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
    if (!editing.id && editing.rol !== "empleado" && !editing.password) errors.password = "Este campo es obligatorio para este rol.";
    if (!["admin", "jefe_zonal", "coach"].includes(editing.rol) && !editing.tienda_id) errors.tienda_id = "Selecciona una tienda.";
    if (editing.nombres && editing.nombres.trim().length < 2) errors.nombres = "Ingresa al menos 2 caracteres.";
    if (editing.apellidos && editing.apellidos.trim().length < 2) errors.apellidos = "Ingresa al menos 2 caracteres.";
    if (editing.dni && !/^\d{8}$/.test(editing.dni)) errors.dni = "Debe tener exactamente 8 dígitos.";
    if (editing.telefono && !/^\d{9}$/.test(editing.telefono)) errors.telefono = "Debe tener exactamente 9 dígitos.";
    if (editing.telefono_emergencia && !/^\d{9}$/.test(editing.telefono_emergencia)) errors.telefono_emergencia = "Debe tener exactamente 9 dígitos.";
    const usuario = editing.usuario?.trim() || "";
    const isUserName = usuario.length >= 3 && /^[a-z0-9._-]+$/i.test(usuario);
    const isEmail = usuario.length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(usuario);
    if (usuario && !isUserName && !isEmail) errors.usuario = "Ingresa un usuario válido o un correo electrónico.";
    if (editing.fecha_nacimiento && editing.fecha_nacimiento > todayISO()) errors.fecha_nacimiento = "La fecha no puede ser futura.";
    if (editing.sueldo !== "" && Number(editing.sueldo) < 0) errors.sueldo = "Debe ser igual o mayor que cero.";
    if (editing.numero_hijos !== "" && (!Number.isInteger(Number(editing.numero_hijos)) || Number(editing.numero_hijos) < 0)) errors.numero_hijos = "Ingresa un número entero igual o mayor que cero.";
    if (["administrador_tienda", "vendedor"].includes(editing.rol) && !editing.codigo_vendedor?.trim()) errors.codigo_vendedor = "Este campo es obligatorio.";
    if (editing.password && editing.password.length < 6) errors.password = "Debe tener al menos 6 caracteres.";
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    setBusy(true);
    try {
      const payload = { ...editing, tienda_id: ["admin", "jefe_zonal", "coach"].includes(editing.rol) ? null : Number(editing.tienda_id) || null };
      if (!payload.password) delete payload.password;
      await api(editing.id ? `/usuarios/${editing.id}` : "/usuarios", {
        method: editing.id ? "PUT" : "POST", body: payload,
      });
      closeEditor();
      await load();
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
        subtitle={isAdmin ? (isMainAdmin ? "Jefes zonales y Coaches con acceso al sistema." : "Administradores de tienda con acceso al sistema.") : "Empleados, vendedores y personal de seguridad de tu tienda."}
        action={<div className="header-actions">
          {isAdmin ? <>
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
          <div className={`data-table ${isAdmin ? "data-table--usuarios" : "data-table--usuarios-tienda"}`}>
            <div className="data-table__head">
              <span>Persona</span><span>DNI</span><span>Usuario</span><span>Teléfono</span>
              {isAdmin ? <><span>Rol</span><span>Tienda</span></> : <span>Rol en tienda</span>}
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
                  <span className={`role role--${item.rol}`}>{databaseRoleLabels[item.rol] || personalRoleLabels[item.rol_personal] || roleLabels[item.rol] || item.rol}</span>
                  <span>{item.tienda_nombre || "—"}</span>
                </>}
                {!isAdmin && <span className={`role role--${item.rol}`}>{roleLabels[item.rol] || item.rol}</span>}
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
        wide
      >
        {editing && (
          <form className="form-grid" onSubmit={save} noValidate>
            {formError && <div className="span-2"><Notice type="error" onClose={() => setFormError("")}>{formError}</Notice></div>}
            <h3 className="form-section-title span-2">Acceso e identificación</h3>
            <Field label="Nombres" error={fieldErrors.nombres}><input required value={editing.nombres} onChange={(e) => set("nombres", e.target.value)} /></Field>
            <Field label="Apellidos" error={fieldErrors.apellidos}><input required value={editing.apellidos} onChange={(e) => set("apellidos", e.target.value)} /></Field>
            <Field label="Usuario o correo" error={fieldErrors.usuario}><input required type="text" autoComplete="username" maxLength={100} value={editing.usuario} onChange={(e) => set("usuario", e.target.value)} /></Field>
            <Field label={editing.id ? "Nueva contraseña" : "Contraseña"} error={fieldErrors.password} hint={editing.id ? "Déjala vacía para conservar la actual o agrega una para habilitar el acceso." : editing.rol === "empleado" ? "Opcional. Sin contraseña, el empleado no podrá iniciar sesión." : "Obligatoria para este rol; mínimo 6 caracteres."}>
              <input required={!editing.id && editing.rol !== "empleado"} type="password" autoComplete="new-password" value={editing.password} onChange={(e) => set("password", e.target.value)} />
            </Field>
            <Field label="DNI" error={fieldErrors.dni}><input required inputMode="numeric" maxLength={8} value={editing.dni} onChange={(e) => set("dni", e.target.value.replace(/\D/g, ""))} /></Field>
            {["administrador_tienda", "vendedor"].includes(editing.rol) && <Field label="Código de vendedor" error={fieldErrors.codigo_vendedor}><input required maxLength={50} value={editing.codigo_vendedor || ""} onChange={(e) => set("codigo_vendedor", e.target.value)} /></Field>}
            <Field label="Activo">
              <select value={editing.estado} onChange={(e) => set("estado", e.target.value)}>
                <option value="activo">Sí</option>
                <option value="inactivo">No</option>
              </select>
            </Field>

            <h3 className="form-section-title span-2">Datos laborales</h3>
            <Field label="Fecha de ingreso *" error={fieldErrors.fecha_ingreso} hint="Viene con la fecha de hoy; cámbiala si el ingreso real fue otro día."><input required type="date" value={editing.fecha_ingreso || ""} onChange={(e) => set("fecha_ingreso", e.target.value)} /></Field>
            <Field label="Fecha de salida" error={fieldErrors.fecha_salida} hint="Se deja en blanco al crear el usuario."><input type="date" disabled={!editing.id} min={editing.fecha_ingreso || undefined} value={editing.fecha_salida || ""} onChange={(e) => set("fecha_salida", e.target.value)} /></Field>
            <Field label="Motivo de salida">
              <select disabled={!editing.id || !editing.fecha_salida} value={editing.motivo_salida || ""} onChange={(e) => set("motivo_salida", e.target.value)}>
                <option value="">Sin especificar</option><option value="Apoyo vacacional">Apoyo vacacional</option>
                <option value="Ausentismo">Ausentismo</option><option value="Personal">Personal</option>
                <option value="Temas de estudios">Temas de estudios</option><option value="Salud">Salud</option>
                <option value="Mejor oferta">Mejor oferta</option><option value="Cambio de área">Cambio de área</option>
                <option value="Deserción">Deserción</option><option value="Estudios">Estudios</option>
                <option value="Mejor oportunidad">Mejor oportunidad</option><option value="Otro">Otro</option>
              </select>
            </Field>
            <Field label="Sueldo" error={fieldErrors.sueldo}><input type="number" min="0" step="0.01" inputMode="decimal" value={editing.sueldo ?? ""} onChange={(e) => set("sueldo", e.target.value)} /></Field>
            {isStoreAdmin && <Field label="Rol en tienda" error={fieldErrors.rol}>
              <select required value={editing.rol} onChange={(e) => set("rol", e.target.value)}>
                <option value="empleado">Empleado</option>
                <option value="vendedor">Vendedor</option>
                <option value="seguridad">Seguridad</option>
              </select>
            </Field>}
            {isAdmin && (
              <>
                <Field label="Rol">
                  {isMainAdmin ? <select value={editing.rol} onChange={(e) => set("rol", e.target.value)}><option value="jefe_zonal">Jefe zonal</option><option value="coach">Coach</option></select> : <input readOnly value={roleLabels[editing.rol] || editing.rol} />}
                </Field>
                <Field label="Tienda" error={fieldErrors.tienda_id} hint={["admin", "jefe_zonal", "coach"].includes(editing.rol) ? "Este rol no requiere una tienda asignada." : undefined}>
                  <select required={!['admin', 'jefe_zonal', 'coach'].includes(editing.rol)} disabled={['admin', 'jefe_zonal', 'coach'].includes(editing.rol)} value={editing.tienda_id} onChange={(e) => set("tienda_id", e.target.value)}>
                    <option value="">Selecciona una tienda</option>
                    {tiendaOptions.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </Field>
              </>
            )}

            <h3 className="form-section-title span-2">Datos personales y contacto</h3>
            <Field label="Fecha de nacimiento" error={fieldErrors.fecha_nacimiento}><input type="date" max={todayISO()} value={editing.fecha_nacimiento || ""} onChange={(e) => set("fecha_nacimiento", e.target.value)} /></Field>
            <Field label="Edad" hint="Se calcula según la fecha de nacimiento."><input readOnly tabIndex={-1} value={calculateAge(editing.fecha_nacimiento)} placeholder="—" /></Field>
            <Field label="Sexo">
              <select value={editing.sexo} onChange={(e) => set("sexo", e.target.value)}>
                <option value="hombre">Hombre</option>
                <option value="mujer">Mujer</option>
                <option value="no_especificado">No especificado</option>
              </select>
            </Field>
            <Field label="Teléfono" error={fieldErrors.telefono} hint="9 dígitos, opcional"><input inputMode="tel" maxLength={9} value={editing.telefono} onChange={(e) => set("telefono", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Teléfono de emergencia" error={fieldErrors.telefono_emergencia} hint="9 dígitos, opcional"><input inputMode="tel" maxLength={9} value={editing.telefono_emergencia || ""} onChange={(e) => set("telefono_emergencia", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Distrito"><input maxLength={100} value={editing.distrito || ""} onChange={(e) => set("distrito", e.target.value)} /></Field>
            <Field label="Dirección" className="span-2"><input maxLength={250} value={editing.direccion || ""} onChange={(e) => set("direccion", e.target.value)} /></Field>

            <h3 className="form-section-title span-2">Formación y datos complementarios</h3>
            <Field label="Grado académico">
              <select value={editing.grado_academico} onChange={(e) => set("grado_academico", e.target.value)}>
                <option value="sin_especificar">Sin especificar</option>
                <option value="primaria">Primaria</option><option value="secundaria">Secundaria</option>
                <option value="tecnico">Técnico</option><option value="universitario">Universitario</option><option value="postgrado">Postgrado</option>
              </select>
            </Field>
            <Field label="Ciclo / semestre"><input maxLength={50} value={editing.ciclo_semestre || ""} onChange={(e) => set("ciclo_semestre", e.target.value)} /></Field>
            <Field label="Estado civil">
              <select value={editing.estado_civil} onChange={(e) => set("estado_civil", e.target.value)}>
                <option value="sin_especificar">Sin especificar</option><option value="soltero">Soltero(a)</option>
                <option value="casado">Casado(a)</option><option value="conviviente">Conviviente</option>
                <option value="divorciado">Divorciado(a)</option><option value="viudo">Viudo(a)</option>
              </select>
            </Field>
            <Field label="Número de hijos" error={fieldErrors.numero_hijos}><input type="number" min="0" step="1" value={editing.numero_hijos ?? 0} onChange={(e) => set("numero_hijos", e.target.value)} /></Field>
            <Field label="Talla de zapatillas"><input maxLength={10} value={editing.talla_zapatillas || ""} onChange={(e) => set("talla_zapatillas", e.target.value)} /></Field>
            <Field label="Talla de polo">
              <select value={editing.talla_polo} onChange={(e) => set("talla_polo", e.target.value)}>
                <option value="sin_especificar">Sin especificar</option><option value="s">S</option><option value="m">M</option>
                <option value="l">L</option><option value="xl">XL</option><option value="xxl">XXL</option>
              </select>
            </Field>
            <Field label="Condición de salud" className="span-2"><textarea rows={2} maxLength={500} value={editing.condicion_salud || ""} onChange={(e) => set("condicion_salud", e.target.value)} /></Field>
            <div className="form-actions span-2">
              <button type="button" className="button button--ghost" onClick={closeEditor}>Cancelar</button>
              <button className="button button--primary" disabled={busy}>{busy ? "Creando usuario…" : editing.id ? "Guardar cambios" : "Crear usuario"}</button>
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
