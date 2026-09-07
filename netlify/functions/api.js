import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import ExcelJS from "exceljs";
import { parse as parseCookie, serialize as serializeCookie } from "cookie";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const loginAttempts = new Map();
const userRoles = new Set(["admin", "jefe_tienda", "empleado"]);
const userStates = new Set(["activo", "inactivo"]);
const tiendaEstados = new Set(["activo", "inactivo"]);
const asistenciaEstados = new Set([
  "presente", "tardanza", "medio_turno", "apoyo", "falta", "permiso", "descanso_medico", "suspension",
]);
const estadoLabels = {
  presente: "Asistencia", tardanza: "Tardanza", medio_turno: "Medio Turno", apoyo: "Apoyo",
  falta: "Falta", permiso: "Permiso", descanso_medico: "Descanso Médico", suspension: "Suspensión",
};
const presenteEstados = new Set(["presente", "tardanza", "medio_turno", "apoyo"]);
const operacionesLog = new Set(["creacion", "edicion", "eliminacion"]);
const progresoLabels = { pendiente: "Pendiente", en_curso: "En curso", completado: "Completado" };
const progresoEstados = new Set(["pendiente", "en_curso", "completado"]);

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

function json(statusCode, body, extraHeaders = {}) {
  return { statusCode, headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body) };
}

function normalizePath(event) {
  return event.path
    .replace(/^\/\.netlify\/functions\/api/, "")
    .replace(/^\/api/, "")
    .replace(/\/+$/, "") || "/";
}

function bodyOf(event) {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    throw httpError("El cuerpo de la solicitud no es JSON válido.", 400);
  }
}

function requireFields(data, fields) {
  const missing = fields.filter((key) => data[key] === undefined || data[key] === null || data[key] === "");
  if (missing.length) {
    throw httpError(`Completa los campos obligatorios: ${missing.join(", ")}.`, 400);
  }
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dbError(error) {
  if (error.code === "23505") return httpError("Ya existe un registro con esos datos.", 409);
  if (error.code === "23503") {
    return httpError("La operación no es válida porque hace referencia a un registro inexistente o en uso.", 409);
  }
  console.error(error);
  return httpError("Ocurrió un error al acceder a la base de datos.", 500);
}

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.CONTEXT === "production") {
    throw httpError("Falta configurar JWT_SECRET en Netlify.", 500);
  }
  return "asiste-development-secret-change-me";
}

function sessionCookie(token, event) {
  const isProduction = process.env.CONTEXT === "production" || event.headers["x-forwarded-proto"] === "https";
  return serializeCookie("asiste_session", token, {
    httpOnly: true, secure: isProduction, sameSite: "lax", path: "/", maxAge: 60 * 60 * 10,
  });
}

function clearSessionCookie(event) {
  const isProduction = process.env.CONTEXT === "production" || event.headers["x-forwarded-proto"] === "https";
  return serializeCookie("asiste_session", "", {
    httpOnly: true, secure: isProduction, sameSite: "lax", path: "/", maxAge: 0,
  });
}

function currentUser(event) {
  const cookies = parseCookie(event.headers.cookie || "");
  const bearer = event.headers.authorization?.replace(/^Bearer\s+/i, "");
  const token = cookies.asiste_session || bearer;
  if (!token) return null;
  try {
    return jwt.verify(token, jwtSecret());
  } catch {
    return null;
  }
}

function ensureAuth(event, roles) {
  const user = currentUser(event);
  if (!user) throw httpError("Tu sesión expiró. Inicia sesión nuevamente.", 401);
  if (roles) {
    const allowed = Array.isArray(roles) ? roles : [roles];
    if (!allowed.includes(user.rol)) throw httpError("No tienes permisos para realizar esta acción.", 403);
  }
  return user;
}

// ---------- Validación ----------

function cleanUsuario(value) {
  return cleanText(value).toLowerCase();
}

function validateUserPayload(data, creating = false) {
  requireFields(data, ["nombres", "apellidos", "dni", "usuario", "rol", "estado", "fecha_ingreso"]);
  if (cleanText(data.nombres).length < 2 || cleanText(data.apellidos).length < 2) {
    throw httpError("Los nombres y apellidos deben ser válidos.", 400);
  }
  if (!/^\d{8}$/.test(cleanText(data.dni))) {
    throw httpError("El DNI debe tener 8 dígitos.", 400);
  }
  const usuario = cleanUsuario(data.usuario);
  if (usuario.length < 3 || !/^[a-z0-9._-]+$/.test(usuario)) {
    throw httpError("El usuario debe tener al menos 3 caracteres (letras, números, punto, guion).", 400);
  }
  if (data.telefono && !/^\d{9}$/.test(cleanText(data.telefono))) {
    throw httpError("El teléfono debe tener 9 dígitos.", 400);
  }
  if (!userRoles.has(data.rol)) throw httpError("El rol no es válido.", 400);
  if (!userStates.has(data.estado)) throw httpError("El estado no es válido.", 400);
  if (!isISODate(data.fecha_ingreso) || (data.fecha_salida && !isISODate(data.fecha_salida))) {
    throw httpError("Las fechas de ingreso y salida deben ser vÃ¡lidas.", 400);
  }
  if (data.fecha_salida && data.fecha_salida < data.fecha_ingreso) {
    throw httpError("La fecha de salida no puede ser anterior a la fecha de ingreso.", 400);
  }
  if (data.rol === "admin" && data.tienda_id) {
    throw httpError("Un administrador no debe tener tienda asignada.", 400);
  }
  if (data.rol !== "admin" && !data.tienda_id) {
    throw httpError("Selecciona la tienda del usuario.", 400);
  }
  if ((creating || data.password) && String(data.password || "").length < 6) {
    throw httpError("La contraseña debe tener al menos 6 caracteres.", 400);
  }
}

function validateTiendaPayload(data) {
  requireFields(data, ["nombre", "estado"]);
  if (cleanText(data.nombre).length < 2) throw httpError("El nombre de la tienda no es válido.", 400);
  if (!tiendaEstados.has(data.estado)) throw httpError("El estado no es válido.", 400);
}

function validateCursoPayload(data) {
  requireFields(data, ["nombre", "competencia"]);
  if (cleanText(data.nombre).length < 3) throw httpError("El nombre del curso no es válido.", 400);
  if (cleanText(data.competencia).length < 2) throw httpError("La competencia no es válida.", 400);
}

function validateEncargadoPayload(data) {
  requireFields(data, ["nombre"]);
  if (cleanText(data.nombre).length < 2) throw httpError("El nombre del encargado no es válido.", 400);
}

function validIds(list) {
  const ids = [...new Set((list || []).map(Number))];
  if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
    throw httpError("Uno de los trabajadores seleccionados no es válido.", 400);
  }
  return ids;
}

// ---------- Autenticación ----------

async function login(event) {
  const clientIp = event.headers["x-nf-client-connection-ip"]
    || event.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || "local";
  const attempt = loginAttempts.get(clientIp);
  if (attempt?.blockedUntil > Date.now()) {
    return json(429, { error: "Demasiados intentos. Espera unos minutos antes de volver a intentar." });
  }
  const { usuario, password } = bodyOf(event);
  requireFields({ usuario, password }, ["usuario", "password"]);
  const { data: account, error } = await supabase
    .from("usuarios")
    .select("id,nombres,apellidos,usuario,password,rol,estado,tienda_id")
    .eq("usuario", cleanUsuario(usuario))
    .maybeSingle();
  if (error) throw dbError(error);

  const fail = () => {
    const count = (attempt?.count || 0) + 1;
    loginAttempts.set(clientIp, { count, blockedUntil: count >= 5 ? Date.now() + 15 * 60_000 : 0 });
    return json(401, { error: "Usuario o contraseña incorrectos." });
  };
  if (!account || account.estado !== "activo") return fail();
  const valid = await bcrypt.compare(String(password), account.password);
  if (!valid) return fail();

  loginAttempts.delete(clientIp);
  const user = {
    id: account.id, nombres: account.nombres, apellidos: account.apellidos,
    usuario: account.usuario, rol: account.rol, tienda_id: account.tienda_id,
  };
  const token = jwt.sign(user, jwtSecret(), { expiresIn: "10h" });
  return json(200, { user }, { "Set-Cookie": sessionCookie(token, event) });
}

// ---------- Usuarios ----------

function mapUserRow(row) {
  const { tiendas, ...rest } = row;
  return { ...rest, tienda_nombre: tiendas?.nombre || null };
}

async function listUsers(actor, storeId = null) {
  let request = supabase
    .from("usuarios")
    .select("id,nombres,apellidos,dni,usuario,telefono,rol,tienda_id,estado,fecha_ingreso,fecha_salida,fecha_creacion,tiendas!usuarios_tienda_id_fkey(nombre)")
    .order("nombres");
  if (actor.rol === "jefe_tienda") request = request.eq("tienda_id", actor.tienda_id).eq("rol", "empleado");
  if (actor.rol === "admin" && storeId) request = request.eq("tienda_id", storeId);
  if (actor.rol === "admin" && !storeId) request = request.eq("rol", "jefe_tienda");
  const { data, error } = await request;
  if (error) throw dbError(error);
  return data.map(mapUserRow);
}

async function ensureUniqueUser(usuario, dni, excludeId) {
  let byUsuario = supabase.from("usuarios").select("id").eq("usuario", usuario);
  let byDni = supabase.from("usuarios").select("id").eq("dni", dni);
  if (excludeId) {
    byUsuario = byUsuario.neq("id", excludeId);
    byDni = byDni.neq("id", excludeId);
  }
  const [usuarioResult, dniResult] = await Promise.all([byUsuario, byDni]);
  if (usuarioResult.data?.length) throw httpError("Ese nombre de usuario ya está registrado.", 409);
  if (dniResult.data?.length) throw httpError("Ese DNI ya está registrado.", 409);
}

async function ensureTiendaActiva(tiendaId) {
  const { data: tienda } = await supabase.from("tiendas").select("id,estado").eq("id", tiendaId).maybeSingle();
  if (!tienda) throw httpError("La tienda seleccionada no existe.", 400);
  return tienda;
}

async function createUser(event, actor) {
  const data = bodyOf(event);
  if (actor.rol === "jefe_tienda") {
    data.rol = "empleado";
    data.tienda_id = actor.tienda_id;
  }
  validateUserPayload(data, true);
  const usuario = cleanUsuario(data.usuario);
  const dni = cleanText(data.dni);
  await ensureUniqueUser(usuario, dni);
  if (data.rol !== "admin") await ensureTiendaActiva(data.tienda_id);
  const password = await bcrypt.hash(String(data.password), 12);
  const { data: created, error } = await supabase.from("usuarios").insert({
    nombres: cleanText(data.nombres), apellidos: cleanText(data.apellidos), dni, usuario, password,
    telefono: data.telefono ? cleanText(data.telefono) : null, rol: data.rol,
    tienda_id: data.rol === "admin" ? null : Number(data.tienda_id), estado: data.estado,
    fecha_ingreso: data.fecha_ingreso, fecha_salida: data.fecha_salida || null,
  }).select("id,nombres,apellidos,dni,usuario,telefono,rol,tienda_id,estado,fecha_ingreso,fecha_salida").single();
  if (error) throw dbError(error);
  return created;
}

async function updateUser(event, id, actor) {
  const data = bodyOf(event);
  const { data: current } = await supabase.from("usuarios").select("rol,estado,tienda_id").eq("id", id).maybeSingle();
  if (!current) throw httpError("Usuario no encontrado.", 404);
  if (actor.rol === "jefe_tienda") {
    if (current.tienda_id !== actor.tienda_id || current.rol !== "empleado") {
      throw httpError("No puedes editar este usuario.", 403);
    }
    data.rol = "empleado";
    data.tienda_id = actor.tienda_id;
  }
  validateUserPayload(data);
  if (Number(id) === Number(actor.id) && (data.rol !== "admin" || data.estado !== "activo")) {
    throw httpError("No puedes quitarte tu propio acceso de administrador.", 400);
  }
  if (current.rol === "admin" && current.estado === "activo"
      && (data.rol !== "admin" || data.estado !== "activo")) {
    const { count } = await supabase.from("usuarios").select("id", { count: "exact", head: true })
      .eq("rol", "admin").eq("estado", "activo");
    if ((count || 0) <= 1) throw httpError("Debe existir al menos un administrador activo.", 400);
  }
  const usuario = cleanUsuario(data.usuario);
  const dni = cleanText(data.dni);
  await ensureUniqueUser(usuario, dni, id);
  if (data.rol !== "admin") await ensureTiendaActiva(data.tienda_id);
  const payload = {
    nombres: cleanText(data.nombres), apellidos: cleanText(data.apellidos), dni, usuario,
    telefono: data.telefono ? cleanText(data.telefono) : null, rol: data.rol,
    tienda_id: data.rol === "admin" ? null : Number(data.tienda_id), estado: data.estado,
    fecha_ingreso: data.fecha_ingreso, fecha_salida: data.fecha_salida || null,
  };
  if (data.password) payload.password = await bcrypt.hash(String(data.password), 12);
  const { error } = await supabase.from("usuarios").update(payload).eq("id", id);
  if (error) throw dbError(error);
}

async function deleteUser(id, actor) {
  const { data: target, error } = await supabase.from("usuarios").select("id,tienda_id,rol").eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!target) throw httpError("Usuario no encontrado.", 404);
  if (actor.rol === "jefe_tienda" && (target.tienda_id !== actor.tienda_id || target.rol !== "empleado")) {
    throw httpError("No puedes eliminar este usuario.", 403);
  }
  if (Number(id) === Number(actor.id)) throw httpError("No puedes eliminarte a ti mismo.", 400);
  const [asistenciasCheck, progresoCheck] = await Promise.all([
    supabase.from("asistencias").select("id", { count: "exact", head: true }).eq("usuario_id", id),
    supabase.from("capacitacion_progreso").select("id", { count: "exact", head: true }).eq("usuario_id", id),
  ]);
  const tieneHistorial = (asistenciasCheck.count || 0) > 0 || (progresoCheck.count || 0) > 0;
  if (tieneHistorial) {
    const { error: updateError } = await supabase.from("usuarios").update({ estado: "inactivo" }).eq("id", id);
    if (updateError) throw dbError(updateError);
    return { eliminado: false, inhabilitado: true };
  }
  const { error: deleteError } = await supabase.from("usuarios").delete().eq("id", id);
  if (deleteError) throw dbError(deleteError);
  return { eliminado: true, inhabilitado: false };
}

async function importUsers(event, actor) {
  const body = bodyOf(event);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length || rows.length > 200) throw httpError("El archivo debe contener entre 1 y 200 usuarios.", 400);
  const results = [];
  for (let index = 0; index < rows.length; index += 1) {
    try {
      const data = { ...rows[index] };
      if (actor.rol === "jefe_tienda") {
        data.rol = "empleado";
        data.tienda_id = actor.tienda_id;
      }
      validateUserPayload(data, true);
      const usuario = cleanUsuario(data.usuario);
      const dni = cleanText(data.dni);
      await ensureUniqueUser(usuario, dni);
      if (data.rol !== "admin") await ensureTiendaActiva(data.tienda_id);
      const password = await bcrypt.hash(String(data.password), 12);
      const { error } = await supabase.from("usuarios").insert({
        nombres: cleanText(data.nombres), apellidos: cleanText(data.apellidos), dni, usuario, password,
        telefono: data.telefono ? cleanText(data.telefono) : null, rol: data.rol,
        tienda_id: data.rol === "admin" ? null : Number(data.tienda_id), estado: data.estado,
        fecha_ingreso: data.fecha_ingreso, fecha_salida: data.fecha_salida || null,
      });
      if (error) throw dbError(error);
      results.push({ fila: index + 2, ok: true });
    } catch (error) {
      results.push({ fila: index + 2, ok: false, error: error.message });
    }
  }
  return { total: rows.length, creados: results.filter((item) => item.ok).length, errores: results.filter((item) => !item.ok) };
}

async function exportUsersExcel(actor, template = false) {
  const rows = template ? [] : await listUsers(actor);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Usuarios");
  sheet.columns = [
    { header: "Nombres", key: "nombres", width: 22 }, { header: "Apellidos", key: "apellidos", width: 24 },
    { header: "DNI", key: "dni", width: 12 }, { header: "Usuario", key: "usuario", width: 18 },
    { header: "Contraseña", key: "password", width: 18 }, { header: "Teléfono", key: "telefono", width: 14 },
    { header: "Rol", key: "rol", width: 16 }, { header: "Tienda", key: "tienda_nombre", width: 24 },
    { header: "Estado", key: "estado", width: 12 }, { header: "Fecha de ingreso", key: "fecha_ingreso", width: 17 },
    { header: "Fecha de salida", key: "fecha_salida", width: 17 },
  ];
  sheet.addRows(rows.map((row) => ({ ...row, password: "" })));
  styleHeader(sheet);
  return excelResponse(workbook, template ? "plantilla-usuarios.xlsx" : "usuarios.xlsx");
}

// ---------- Tiendas ----------

async function listTiendas() {
  const { data, error } = await supabase
    .from("tiendas")
    .select("id,nombre,direccion,estado,fecha_creacion,jefe_id,jefe:usuarios!tiendas_jefe_fk(id,nombres,apellidos)")
    .order("nombre");
  if (error) throw dbError(error);
  return data.map((row) => ({
    ...row,
    jefe: undefined,
    jefe_nombre: row.jefe ? `${row.jefe.nombres} ${row.jefe.apellidos}` : null,
  }));
}

async function syncJefe(tiendaId, jefeId) {
  const { data: jefe } = await supabase.from("usuarios").select("id,rol,tienda_id,estado").eq("id", jefeId).maybeSingle();
  if (!jefe || jefe.estado !== "activo") throw httpError("El usuario seleccionado como jefe no existe o está inactivo.", 400);
  if (jefe.rol !== "jefe_tienda" || jefe.tienda_id !== tiendaId) {
    const { error } = await supabase.from("usuarios").update({ rol: "jefe_tienda", tienda_id: tiendaId }).eq("id", jefeId);
    if (error) throw dbError(error);
  }
}

async function createTienda(event) {
  const data = bodyOf(event);
  validateTiendaPayload(data);
  const { data: created, error } = await supabase.from("tiendas")
    .insert({
      nombre: cleanText(data.nombre),
      direccion: data.direccion ? cleanText(data.direccion) : null,
      estado: data.estado,
    })
    .select("id").single();
  if (error) throw dbError(error);
  if (data.jefe_id) {
    await syncJefe(created.id, Number(data.jefe_id));
    const { error: linkError } = await supabase.from("tiendas").update({ jefe_id: Number(data.jefe_id) }).eq("id", created.id);
    if (linkError) throw dbError(linkError);
  }
  return created;
}

async function updateTienda(event, id) {
  const data = bodyOf(event);
  validateTiendaPayload(data);
  const jefeId = data.jefe_id ? Number(data.jefe_id) : null;
  if (jefeId) await syncJefe(Number(id), jefeId);
  const { error } = await supabase.from("tiendas").update({
    nombre: cleanText(data.nombre),
    direccion: data.direccion ? cleanText(data.direccion) : null,
    estado: data.estado,
    jefe_id: jefeId,
  }).eq("id", id);
  if (error) throw dbError(error);
}

// ---------- Asistencias ----------

async function listAsistenciasDia(event, user) {
  const query = event.queryStringParameters || {};
  const tiendaId = user.rol === "admin" ? Number(query.tienda_id) : user.tienda_id;
  if (!tiendaId) throw httpError("Selecciona una tienda.", 400);
  const fecha = query.fecha && isISODate(query.fecha) ? query.fecha : todayISO();
  let empleadosQuery = supabase.from("usuarios").select("id,nombres,apellidos,dni,estado")
    .eq("tienda_id", tiendaId).in("rol", ["empleado", "jefe_tienda"]).order("nombres");
  if (query.estado === "activo" || query.estado === "inactivo") empleadosQuery = empleadosQuery.eq("estado", query.estado);
  const [{ data: empleados, error: e1 }, { data: registros, error: e2 }] = await Promise.all([
    empleadosQuery,
    supabase.from("asistencias").select("*").eq("tienda_id", tiendaId).eq("fecha", fecha),
  ]);
  if (e1) throw dbError(e1);
  if (e2) throw dbError(e2);
  const byUser = new Map(registros.map((row) => [row.usuario_id, row]));
  return {
    fecha,
    empleados: empleados.map((emp) => ({
      usuario_id: emp.id, nombre: `${emp.nombres} ${emp.apellidos}`, dni: emp.dni, estado: emp.estado,
      registro: byUser.get(emp.id) || null,
    })),
  };
}

async function guardarAsistenciasLote(event, user) {
  const data = bodyOf(event);
  requireFields(data, ["fecha", "marcas"]);
  if (!isISODate(data.fecha)) throw httpError("La fecha no es válida.", 400);
  if (!Array.isArray(data.marcas) || !data.marcas.length) throw httpError("No hay marcas para guardar.", 400);
  const usuarioIds = validIds(data.marcas.map((marca) => marca.usuario_id));
  const { data: empleados, error: eError } = await supabase.from("usuarios")
    .select("id,tienda_id").in("id", usuarioIds);
  if (eError) throw dbError(eError);
  if (empleados.length !== usuarioIds.length || empleados.some((emp) => emp.tienda_id !== user.tienda_id)) {
    throw httpError("Uno de los trabajadores seleccionados no pertenece a tu tienda.", 400);
  }
  const tiendaByUser = new Map(empleados.map((emp) => [emp.id, emp.tienda_id]));

  const { data: existentes, error: exError } = await supabase.from("asistencias")
    .select("usuario_id,estado,observaciones").eq("fecha", data.fecha).in("usuario_id", usuarioIds);
  if (exError) throw dbError(exError);
  const existenteByUser = new Map(existentes.map((row) => [row.usuario_id, row]));

  const upserts = [];
  const logs = [];
  for (const marca of data.marcas) {
    const usuarioId = Number(marca.usuario_id);
    if (!asistenciaEstados.has(marca.estado)) throw httpError("Uno de los estados marcados no es válido.", 400);
    const observaciones = marca.observaciones ? cleanText(marca.observaciones).slice(0, 500) : null;
    const existente = existenteByUser.get(usuarioId);
    if (existente && existente.estado === marca.estado && (existente.observaciones || null) === observaciones) continue;
    const tiendaId = tiendaByUser.get(usuarioId);
    upserts.push({
      usuario_id: usuarioId, tienda_id: tiendaId, fecha: data.fecha, estado: marca.estado,
      observaciones, registrado_por: user.id,
    });
    logs.push({
      usuario_id: usuarioId, tienda_id: tiendaId, fecha: data.fecha,
      operacion: existente ? "edicion" : "creacion",
      estado_anterior: existente ? existente.estado : null, estado_nuevo: marca.estado,
      realizado_por: user.id,
    });
  }
  if (upserts.length) {
    const { error } = await supabase.from("asistencias").upsert(upserts, { onConflict: "usuario_id,fecha" });
    if (error) throw dbError(error);
    const { error: logError } = await supabase.from("log_asistencias").insert(logs);
    if (logError) throw dbError(logError);
  }
  return { actualizados: upserts.length };
}

async function eliminarAsistencia(id, user) {
  const { data: existente, error } = await supabase.from("asistencias")
    .select("id,usuario_id,tienda_id,fecha,estado").eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!existente || existente.tienda_id !== user.tienda_id) throw httpError("Registro no encontrado.", 404);
  const { error: deleteError } = await supabase.from("asistencias").delete().eq("id", id);
  if (deleteError) throw dbError(deleteError);
  const { error: logError } = await supabase.from("log_asistencias").insert({
    usuario_id: existente.usuario_id, tienda_id: existente.tienda_id, fecha: existente.fecha,
    operacion: "eliminacion", estado_anterior: existente.estado, estado_nuevo: null, realizado_por: user.id,
  });
  if (logError) throw dbError(logError);
}

async function listAsistenciasHistorial(event, user) {
  const query = event.queryStringParameters || {};
  const tiendaId = user.rol === "admin" ? (query.tienda_id ? Number(query.tienda_id) : null) : user.tienda_id;
  const desde = query.desde && isISODate(query.desde) ? query.desde : `${todayISO().slice(0, 7)}-01`;
  const hasta = query.hasta && isISODate(query.hasta) ? query.hasta : todayISO();
  const ascending = query.orden === "asc";
  let request = supabase.from("asistencias")
    .select("*, usuarios!asistencias_usuario_id_fkey!inner(nombres,apellidos,usuario,estado)")
    .gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending });
  if (tiendaId) request = request.eq("tienda_id", tiendaId);
  if (query.estado_usuario === "activo" || query.estado_usuario === "inactivo") {
    request = request.eq("usuarios.estado", query.estado_usuario);
  }
  const { data, error } = await request;
  if (error) throw dbError(error);
  return data.map((row) => ({
    ...row, usuarios: undefined,
    nombre: row.usuarios ? `${row.usuarios.nombres} ${row.usuarios.apellidos}` : "",
    usuario: row.usuarios?.usuario || "",
  }));
}

async function listLogAsistencias(event, user) {
  const query = event.queryStringParameters || {};
  const desde = query.desde && isISODate(query.desde) ? query.desde : `${todayISO().slice(0, 7)}-01`;
  const hasta = query.hasta && isISODate(query.hasta) ? query.hasta : todayISO();
  let request = supabase.from("log_asistencias")
    .select("id,fecha,operacion,estado_anterior,estado_nuevo,created_at,"
      + "usuarios!log_asistencias_usuario_id_fkey(nombres,apellidos),"
      + "realizador:usuarios!log_asistencias_realizado_por_fkey(nombres,apellidos)")
    .eq("tienda_id", user.tienda_id)
    .gte("created_at", `${desde}T00:00:00`).lte("created_at", `${hasta}T23:59:59`)
    .order("created_at", { ascending: false });
  if (operacionesLog.has(query.operacion)) request = request.eq("operacion", query.operacion);
  const { data, error } = await request;
  if (error) throw dbError(error);
  return data.map((row) => ({
    id: row.id, fecha: row.fecha, operacion: row.operacion, created_at: row.created_at,
    estado_anterior: row.estado_anterior ? (estadoLabels[row.estado_anterior] || row.estado_anterior) : null,
    estado_nuevo: row.estado_nuevo ? (estadoLabels[row.estado_nuevo] || row.estado_nuevo) : null,
    trabajador: row.usuarios ? `${row.usuarios.nombres} ${row.usuarios.apellidos}` : "",
    realizado_por: row.realizador ? `${row.realizador.nombres} ${row.realizador.apellidos}` : "",
  }));
}

async function misAsistencias(event, user) {
  const query = event.queryStringParameters || {};
  const desde = query.desde && isISODate(query.desde) ? query.desde : `${todayISO().slice(0, 7)}-01`;
  const hasta = query.hasta && isISODate(query.hasta) ? query.hasta : todayISO();
  const { data, error } = await supabase.from("asistencias").select("*")
    .eq("usuario_id", user.id).gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false });
  if (error) throw dbError(error);
  return data;
}

// ---------- Cursos y Encargados (catálogo, solo admin) ----------

async function listCursos() {
  const { data, error } = await supabase.from("cursos").select("*").order("nombre");
  if (error) throw dbError(error);
  return data;
}

async function createCurso(event) {
  const data = bodyOf(event);
  validateCursoPayload(data);
  const { data: created, error } = await supabase.from("cursos")
    .insert({ nombre: cleanText(data.nombre), competencia: cleanText(data.competencia), activo: data.activo !== false })
    .select().single();
  if (error) throw dbError(error);
  return created;
}

async function updateCurso(event, id) {
  const data = bodyOf(event);
  validateCursoPayload(data);
  const { error } = await supabase.from("cursos")
    .update({ nombre: cleanText(data.nombre), competencia: cleanText(data.competencia), activo: !!data.activo })
    .eq("id", id);
  if (error) throw dbError(error);
}

async function deleteCurso(id) {
  const { count, error: countError } = await supabase.from("capacitacion_progreso")
    .select("id", { count: "exact", head: true }).eq("curso_id", id);
  if (countError) throw dbError(countError);
  if (count) {
    const { error } = await supabase.from("cursos").update({ activo: false }).eq("id", id);
    if (error) throw dbError(error);
    return { eliminado: false, inhabilitado: true };
  }
  const { error } = await supabase.from("cursos").delete().eq("id", id);
  if (error) throw dbError(error);
  return { eliminado: true, inhabilitado: false };
}

async function listEncargados() {
  const { data, error } = await supabase.from("encargados").select("*").order("nombre");
  if (error) throw dbError(error);
  return data;
}

async function createEncargado(event) {
  const data = bodyOf(event);
  validateEncargadoPayload(data);
  const { data: created, error } = await supabase.from("encargados")
    .insert({ nombre: cleanText(data.nombre), activo: data.activo !== false }).select().single();
  if (error) throw dbError(error);
  return created;
}

async function updateEncargado(event, id) {
  const data = bodyOf(event);
  validateEncargadoPayload(data);
  const { error } = await supabase.from("encargados")
    .update({ nombre: cleanText(data.nombre), activo: !!data.activo }).eq("id", id);
  if (error) throw dbError(error);
}

// ---------- Capacitaciones (progreso por trabajador, jefe de tienda) ----------

async function listTrabajadores(event, user) {
  const query = event.queryStringParameters || {};
  let request = supabase.from("usuarios")
    .select("id,nombres,apellidos,usuario,rol,estado")
    .eq("tienda_id", user.tienda_id).in("rol", ["empleado", "jefe_tienda"]).order("nombres");
  if (query.estado === "activo" || query.estado === "inactivo") request = request.eq("estado", query.estado);
  const { data, error } = await request;
  if (error) throw dbError(error);
  if (!query.curso_id) return data;
  const cursoId = Number(query.curso_id);
  const ids = data.map((t) => t.id);
  const { data: progreso, error: pError } = await supabase.from("capacitacion_progreso")
    .select("usuario_id,estado").eq("curso_id", cursoId).in("usuario_id", ids.length ? ids : [0]);
  if (pError) throw dbError(pError);
  const byUser = new Map(progreso.map((row) => [row.usuario_id, row.estado]));
  return data.map((t) => ({ ...t, progreso_estado: byUser.get(t.id) || "pendiente" }));
}

async function getTrabajadorPerfil(id, user) {
  const { data: trabajador, error } = await supabase.from("usuarios")
    .select("id,nombres,apellidos,usuario,rol,estado,tienda_id").eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!trabajador || trabajador.tienda_id !== user.tienda_id) throw httpError("Trabajador no encontrado.", 404);

  const { data: progresoRows, error: progresoError } = await supabase.from("capacitacion_progreso")
    .select("curso_id,estado,duracion_horas,encargado_id,fecha_finalizacion,encargados(id,nombre,activo)")
    .eq("usuario_id", id);
  if (progresoError) throw dbError(progresoError);
  const progresoByCurso = new Map(progresoRows.map((row) => [row.curso_id, row]));

  const cursoIdsConHistorial = [...progresoByCurso.keys()];
  let cursosQuery = supabase.from("cursos").select("*");
  cursosQuery = cursoIdsConHistorial.length
    ? cursosQuery.or(`activo.eq.true,id.in.(${cursoIdsConHistorial.join(",")})`)
    : cursosQuery.eq("activo", true);
  const { data: cursos, error: cursosError } = await cursosQuery.order("nombre");
  if (cursosError) throw dbError(cursosError);

  const items = cursos.map((curso) => {
    const progreso = progresoByCurso.get(curso.id);
    return {
      curso_id: curso.id, titulo: curso.nombre, competencia: curso.competencia, curso_activo: curso.activo,
      estado: progreso?.estado || "pendiente",
      duracion_horas: progreso?.duracion_horas ?? null,
      encargado_id: progreso?.encargado_id ?? null,
      encargado_nombre: progreso?.encargados
        ? `${progreso.encargados.nombre}${progreso.encargados.activo ? "" : " (inactivo)"}` : null,
      fecha_finalizacion: progreso?.fecha_finalizacion ?? null,
    };
  });
  const completados = items.filter((item) => item.estado === "completado").length;
  return {
    trabajador: {
      id: trabajador.id, nombres: trabajador.nombres, apellidos: trabajador.apellidos,
      usuario: trabajador.usuario, rol: trabajador.rol, estado: trabajador.estado,
    },
    resumen: { completados, total: items.length },
    cursos: items,
  };
}

async function guardarProgreso(event, usuarioId, cursoId, user) {
  const data = bodyOf(event);
  requireFields(data, ["estado", "encargado_id"]);
  if (!progresoEstados.has(data.estado)) throw httpError("El estado no es válido.", 400);
  const { data: trabajador, error: tError } = await supabase.from("usuarios")
    .select("id,tienda_id").eq("id", usuarioId).maybeSingle();
  if (tError) throw dbError(tError);
  if (!trabajador || trabajador.tienda_id !== user.tienda_id) throw httpError("Trabajador no encontrado.", 404);
  const { data: encargado, error: eError } = await supabase.from("encargados")
    .select("id").eq("id", data.encargado_id).maybeSingle();
  if (eError) throw dbError(eError);
  if (!encargado) throw httpError("El encargado seleccionado no existe.", 400);
  const payload = {
    curso_id: Number(cursoId), usuario_id: Number(usuarioId), tienda_id: trabajador.tienda_id,
    estado: data.estado, duracion_horas: data.duracion_horas ? Number(data.duracion_horas) : null,
    encargado_id: Number(data.encargado_id),
    fecha_finalizacion: data.estado === "completado" ? todayISO() : null,
    actualizado_por: user.id, updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("capacitacion_progreso").upsert(payload, { onConflict: "curso_id,usuario_id" });
  if (error) throw dbError(error);
}

async function getResumenCurso(event, user) {
  const query = event.queryStringParameters || {};
  const cursoId = Number(query.curso_id);
  if (!Number.isInteger(cursoId) || cursoId < 1) throw httpError("Selecciona un curso.", 400);
  const tiendaId = user.rol === "admin" ? (query.tienda_id ? Number(query.tienda_id) : null) : user.tienda_id;

  let trabajadoresQuery = supabase.from("usuarios").select("id,nombres,apellidos,usuario,rol")
    .eq("estado", "activo").in("rol", ["empleado", "jefe_tienda"]);
  if (tiendaId) trabajadoresQuery = trabajadoresQuery.eq("tienda_id", tiendaId);
  const { data: trabajadores, error: tError } = await trabajadoresQuery;
  if (tError) throw dbError(tError);

  const ids = trabajadores.map((t) => t.id);
  const { data: progresoRows, error: pError } = await supabase.from("capacitacion_progreso")
    .select("usuario_id,estado,duracion_horas,fecha_finalizacion,encargados(nombre)")
    .eq("curso_id", cursoId).in("usuario_id", ids.length ? ids : [0]);
  if (pError) throw dbError(pError);
  const byUser = new Map(progresoRows.map((row) => [row.usuario_id, row]));

  const grupos = { completado: [], en_curso: [], pendiente: [] };
  for (const trabajador of trabajadores) {
    const progreso = byUser.get(trabajador.id);
    const estado = progreso?.estado || "pendiente";
    grupos[estado].push({
      usuario_id: trabajador.id, nombre: `${trabajador.nombres} ${trabajador.apellidos}`,
      usuario: trabajador.usuario, rol: trabajador.rol, estado,
      duracion_horas: progreso?.duracion_horas ?? null,
      encargado_nombre: progreso?.encargados?.nombre || null,
      fecha_finalizacion: progreso?.fecha_finalizacion ?? null,
    });
  }
  const total = trabajadores.length;
  return {
    total, completados: grupos.completado.length, en_curso: grupos.en_curso.length, pendientes: grupos.pendiente.length,
    porcentaje: total ? Math.round((grupos.completado.length / total) * 100) : 0,
    grupos,
  };
}

async function asignarLote(event, user) {
  const data = bodyOf(event);
  requireFields(data, ["curso_id", "estado", "encargado_id", "usuario_ids"]);
  if (!progresoEstados.has(data.estado)) throw httpError("El estado no es válido.", 400);
  const cursoId = Number(data.curso_id);
  const encargadoId = Number(data.encargado_id);
  const ids = validIds(data.usuario_ids);
  if (!ids.length) throw httpError("Selecciona al menos un trabajador.", 400);
  const { data: encargado, error: eError } = await supabase.from("encargados")
    .select("id").eq("id", encargadoId).maybeSingle();
  if (eError) throw dbError(eError);
  if (!encargado) throw httpError("El encargado seleccionado no existe.", 400);
  const { data: trabajadores, error: tError } = await supabase.from("usuarios")
    .select("id,tienda_id").in("id", ids);
  if (tError) throw dbError(tError);
  if (trabajadores.length !== ids.length || trabajadores.some((t) => t.tienda_id !== user.tienda_id)) {
    throw httpError("Uno de los trabajadores seleccionados no pertenece a tu tienda.", 400);
  }
  const fechaFinalizacion = data.estado === "completado" ? todayISO() : null;
  const rows = ids.map((usuario_id) => {
    const row = {
      curso_id: cursoId, usuario_id, tienda_id: user.tienda_id, estado: data.estado,
      encargado_id: encargadoId, fecha_finalizacion: fechaFinalizacion,
      actualizado_por: user.id, updated_at: new Date().toISOString(),
    };
    if (data.duracion_horas) row.duracion_horas = Number(data.duracion_horas);
    return row;
  });
  const { error } = await supabase.from("capacitacion_progreso").upsert(rows, { onConflict: "curso_id,usuario_id" });
  if (error) throw dbError(error);
  return { actualizados: ids.length };
}

async function misCapacitaciones(user) {
  const { data: progresoRows, error } = await supabase.from("capacitacion_progreso")
    .select("curso_id,estado,duracion_horas,fecha_finalizacion,encargados(nombre,activo),cursos(id,nombre,competencia,activo)")
    .eq("usuario_id", user.id);
  if (error) throw dbError(error);
  const progresoByCurso = new Map(progresoRows.filter((row) => row.cursos).map((row) => [row.curso_id, row]));
  const { data: cursosActivos, error: cError } = await supabase.from("cursos").select("id,nombre,competencia,activo").eq("activo", true);
  if (cError) throw dbError(cError);
  const allCursos = new Map();
  for (const curso of cursosActivos) allCursos.set(curso.id, curso);
  for (const row of progresoRows) if (row.cursos) allCursos.set(row.cursos.id, row.cursos);
  return [...allCursos.values()].map((curso) => {
    const progreso = progresoByCurso.get(curso.id);
    return {
      curso_id: curso.id, titulo: curso.nombre, competencia: curso.competencia,
      estado: progreso?.estado || "pendiente",
      duracion_horas: progreso?.duracion_horas ?? null,
      encargado_nombre: progreso?.encargados
        ? `${progreso.encargados.nombre}${progreso.encargados.activo ? "" : " (inactivo)"}` : null,
      fecha_finalizacion: progreso?.fecha_finalizacion ?? null,
    };
  }).sort((a, b) => a.titulo.localeCompare(b.titulo));
}

// ---------- Perfil ----------

async function getPerfil(user) {
  const { data, error } = await supabase.from("usuarios")
    .select("id,nombres,apellidos,dni,usuario,telefono,rol,estado,fecha_creacion,tienda_id,tiendas!usuarios_tienda_id_fkey(nombre)")
    .eq("id", user.id).single();
  if (error) throw dbError(error);
  const monthStart = `${todayISO().slice(0, 7)}-01`;
  const today = todayISO();
  const { data: mes } = await supabase.from("asistencias").select("estado")
    .eq("usuario_id", user.id).gte("fecha", monthStart).lte("fecha", today);
  const total = mes?.length || 0;
  const presentes = mes?.filter((row) => presenteEstados.has(row.estado)).length || 0;
  return {
    ...data, tiendas: undefined, tienda_nombre: data.tiendas?.nombre || null,
    asistencia_mes: total ? Math.round((presentes / total) * 100) : null,
    dias_registrados_mes: total,
  };
}

// ---------- Dashboard ----------

async function countRows(table, build) {
  let request = supabase.from(table).select("id", { count: "exact", head: true });
  if (build) request = build(request);
  const { count, error } = await request;
  if (error) throw dbError(error);
  return count || 0;
}

async function getSummary(tiendaFilter, today, monthStart) {
  const [tiendasActivas, usuariosActivos, hoyPresentes, mesTotal, mesPresentes, cursosEnCurso] = await Promise.all([
    tiendaFilter ? Promise.resolve(null) : countRows("tiendas", (q) => q.eq("estado", "activo")),
    countRows("usuarios", (q) => {
      const scoped = q.eq("estado", "activo").in("rol", ["jefe_tienda", "empleado"]);
      return tiendaFilter ? scoped.eq("tienda_id", tiendaFilter) : scoped;
    }),
    countRows("asistencias", (q) => {
      const scoped = q.eq("fecha", today).in("estado", [...presenteEstados]);
      return tiendaFilter ? scoped.eq("tienda_id", tiendaFilter) : scoped;
    }),
    countRows("asistencias", (q) => {
      const scoped = q.gte("fecha", monthStart).lte("fecha", today);
      return tiendaFilter ? scoped.eq("tienda_id", tiendaFilter) : scoped;
    }),
    countRows("asistencias", (q) => {
      const scoped = q.gte("fecha", monthStart).lte("fecha", today).in("estado", [...presenteEstados]);
      return tiendaFilter ? scoped.eq("tienda_id", tiendaFilter) : scoped;
    }),
    countRows("capacitacion_progreso", (q) => {
      const scoped = q.eq("estado", "en_curso");
      return tiendaFilter ? scoped.eq("tienda_id", tiendaFilter) : scoped;
    }),
  ]);
  return {
    tiendas_activas: tiendasActivas,
    usuarios_activos: usuariosActivos,
    asistencias_hoy: hoyPresentes,
    tasa_asistencia_mes: mesTotal ? Math.round((mesPresentes / mesTotal) * 100) : 0,
    cursos_en_curso: cursosEnCurso,
  };
}

async function getStates(tiendaFilter, monthStart, today) {
  let request = supabase.from("asistencias").select("estado").gte("fecha", monthStart).lte("fecha", today);
  if (tiendaFilter) request = request.eq("tienda_id", tiendaFilter);
  const { data, error } = await request;
  if (error) throw dbError(error);
  const counts = {};
  for (const row of data) counts[row.estado] = (counts[row.estado] || 0) + 1;
  return Object.entries(counts).map(([estado, cantidad]) => ({ estado, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
}

async function getTrend(tiendaFilter, todayStr) {
  const months = [];
  const cursor = new Date(`${todayStr}T00:00:00Z`);
  cursor.setUTCDate(1);
  for (let i = 0; i < 12; i += 1) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const naturalEnd = new Date(Date.UTC(year, month + 1, 0));
    const cap = new Date(`${todayStr}T00:00:00Z`);
    const end = (naturalEnd > cap ? cap : naturalEnd).toISOString().slice(0, 10);
    months.unshift({ label: start.slice(0, 7), start, end });
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return Promise.all(months.map(async ({ label, start, end }) => {
    let request = supabase.from("asistencias").select("estado").gte("fecha", start).lte("fecha", end);
    if (tiendaFilter) request = request.eq("tienda_id", tiendaFilter);
    const { data } = await request;
    const total = data?.length || 0;
    const presentes = data?.filter((row) => presenteEstados.has(row.estado)).length || 0;
    return { mes: label, tasa: total ? Math.round((presentes / total) * 100) : 0 };
  }));
}

async function getWorkload(tiendaFilter, monthStart, today) {
  let request = supabase.from("asistencias").select("usuario_id,tienda_id,estado").gte("fecha", monthStart).lte("fecha", today);
  if (tiendaFilter) request = request.eq("tienda_id", tiendaFilter);
  const { data, error } = await request;
  if (error) throw dbError(error);
  const groupKey = tiendaFilter ? "usuario_id" : "tienda_id";
  const groups = new Map();
  for (const row of data) {
    const key = row[groupKey];
    if (!groups.has(key)) groups.set(key, { presentes: 0, otros: 0, faltas: 0, total: 0 });
    const group = groups.get(key);
    group.total += 1;
    if (presenteEstados.has(row.estado)) group.presentes += 1;
    else if (row.estado === "falta") group.faltas += 1;
    else group.otros += 1;
  }
  const ids = [...groups.keys()];
  if (!ids.length) return [];
  const names = new Map();
  if (tiendaFilter) {
    const { data: users } = await supabase.from("usuarios").select("id,nombres,apellidos").in("id", ids);
    for (const user of users || []) names.set(user.id, `${user.nombres} ${user.apellidos}`.trim());
  } else {
    const { data: tiendas } = await supabase.from("tiendas").select("id,nombre").in("id", ids);
    for (const tienda of tiendas || []) names.set(tienda.id, tienda.nombre);
  }
  return [...groups.entries()]
    .map(([id, group]) => ({ nombre: names.get(id) || `#${id}`, ...group }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
}

async function getCourseProgress(tiendaFilter) {
  const { data: cursos, error: cError } = await supabase.from("cursos").select("id,nombre").eq("activo", true).order("nombre");
  if (cError) throw dbError(cError);
  if (!cursos.length) return [];
  const cursoIds = cursos.map((curso) => curso.id);

  let progresoQuery = supabase.from("capacitacion_progreso").select("curso_id,estado").in("curso_id", cursoIds);
  if (tiendaFilter) progresoQuery = progresoQuery.eq("tienda_id", tiendaFilter);
  const { data: progreso, error: pError } = await progresoQuery;
  if (pError) throw dbError(pError);

  let trabajadoresQuery = supabase.from("usuarios").select("id", { count: "exact", head: true })
    .eq("estado", "activo").in("rol", ["empleado", "jefe_tienda"]);
  if (tiendaFilter) trabajadoresQuery = trabajadoresQuery.eq("tienda_id", tiendaFilter);
  const { count: totalTrabajadores, error: tError } = await trabajadoresQuery;
  if (tError) throw dbError(tError);

  const counts = new Map(cursos.map((curso) => [curso.id, { completados: 0, en_curso: 0 }]));
  for (const row of progreso) {
    const bucket = counts.get(row.curso_id);
    if (!bucket) continue;
    if (row.estado === "completado") bucket.completados += 1;
    else if (row.estado === "en_curso") bucket.en_curso += 1;
  }
  return cursos
    .map((curso) => {
      const bucket = counts.get(curso.id);
      const pendientes = Math.max((totalTrabajadores || 0) - bucket.completados - bucket.en_curso, 0);
      return { titulo: curso.nombre, completados: bucket.completados, en_curso: bucket.en_curso, pendientes };
    })
    .sort((a, b) => b.pendientes - a.pendientes)
    .slice(0, 6);
}

async function getRotation(tiendaFilter, desde, hasta) {
  let request = supabase.from("usuarios").select("fecha_ingreso,fecha_salida,tienda_id").in("rol", ["empleado", "jefe_tienda"]);
  if (tiendaFilter) request = request.eq("tienda_id", tiendaFilter);
  const { data, error } = await request;
  if (error) throw dbError(error);
  const months = [];
  const cursor = new Date(`${desde}T00:00:00Z`);
  const limit = new Date(`${hasta}T00:00:00Z`);
  cursor.setUTCDate(1);
  while (cursor <= limit && months.length < 24) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
    const ingreso = (data || []).filter((row) => row.fecha_ingreso >= start && row.fecha_ingreso <= end).length;
    const salida = (data || []).filter((row) => row.fecha_salida && row.fecha_salida >= start && row.fecha_salida <= end).length;
    const personalInicio = (data || []).filter((row) => row.fecha_ingreso <= start && (!row.fecha_salida || row.fecha_salida >= start)).length;
    const personalFin = (data || []).filter((row) => row.fecha_ingreso <= end && (!row.fecha_salida || row.fecha_salida >= end)).length;
    months.push({ mes: `${String(month + 1).padStart(2, "0")}/${String(year).slice(-2)}`, ingreso, salida, personal_inicio: personalInicio, personal_fin: personalFin });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

async function getDashboard(user, event) {
  const query = event.queryStringParameters || {};
  const today = todayISO();
  const defaultStart = `${today.slice(0, 4)}-01-01`;
  const desde = isISODate(query.desde) ? query.desde : defaultStart;
  const hasta = isISODate(query.hasta) ? query.hasta : today;
  const tiendaFilter = user.rol === "admin" ? Number(query.tienda_id) || null : user.tienda_id;
  const [summary, states, trend, workload, progresoCursos, rotation] = await Promise.all([
    getSummary(tiendaFilter, hasta, desde),
    getStates(tiendaFilter, desde, hasta),
    getTrend(tiendaFilter, hasta),
    getWorkload(tiendaFilter, desde, hasta),
    getCourseProgress(tiendaFilter),
    getRotation(tiendaFilter, desde, hasta),
  ]);
  return { summary, states, trend, workload, progresoCursos, rotation, filters: { desde, hasta, tienda_id: tiendaFilter } };
}

// ---------- Documentos (Excel) ----------

function excelSheetName(name) {
  return String(name || "Hoja").replace(/[\\/?*[\]:]/g, "").slice(0, 31) || "Hoja";
}

function styleHeader(worksheet) {
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF172235" } };
  worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: worksheet.columns.length } };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
}

async function fetchAsistenciasExport(tiendaId, desde, hasta) {
  let request = supabase.from("asistencias")
    .select("fecha,estado,observaciones,usuarios!asistencias_usuario_id_fkey(nombres,apellidos,dni)")
    .order("fecha", { ascending: false });
  if (tiendaId) request = request.eq("tienda_id", tiendaId);
  if (desde && isISODate(desde)) request = request.gte("fecha", desde);
  if (hasta && isISODate(hasta)) request = request.lte("fecha", hasta);
  const { data, error } = await request;
  if (error) throw dbError(error);
  return data.map((row) => ({
    fecha: row.fecha, empleado: `${row.usuarios?.nombres || ""} ${row.usuarios?.apellidos || ""}`.trim(),
    dni: row.usuarios?.dni || "", estado: estadoLabels[row.estado] || row.estado,
    observaciones: row.observaciones || "",
  }));
}

async function fetchCapacitacionesExport(tiendaId, desde, hasta) {
  let request = supabase.from("capacitacion_progreso")
    .select("estado,duracion_horas,fecha_finalizacion,updated_at,cursos(nombre,competencia),encargados(nombre),usuarios!capacitacion_progreso_usuario_id_fkey(nombres,apellidos,usuario)")
    .order("updated_at", { ascending: false });
  if (tiendaId) request = request.eq("tienda_id", tiendaId);
  if (desde && isISODate(desde)) request = request.gte("updated_at", `${desde}T00:00:00`);
  if (hasta && isISODate(hasta)) request = request.lte("updated_at", `${hasta}T23:59:59`);
  const { data, error } = await request;
  if (error) throw dbError(error);
  return data.map((row) => ({
    curso: row.cursos?.nombre || "", competencia: row.cursos?.competencia || "",
    empleado: `${row.usuarios?.nombres || ""} ${row.usuarios?.apellidos || ""}`.trim(),
    usuario: row.usuarios?.usuario || "",
    estado: progresoLabels[row.estado] || row.estado,
    duracion_horas: row.duracion_horas || "",
    encargado: row.encargados?.nombre || "",
    fecha_finalizacion: row.fecha_finalizacion || "",
  }));
}

function addAsistenciasSheet(workbook, sheetName, rows) {
  const sheet = workbook.addWorksheet(excelSheetName(sheetName));
  sheet.columns = [
    { header: "Fecha", key: "fecha", width: 14 },
    { header: "Empleado", key: "empleado", width: 28 },
    { header: "DNI", key: "dni", width: 12 },
    { header: "Estado", key: "estado", width: 14 },
    { header: "Observaciones", key: "observaciones", width: 30 },
  ];
  sheet.addRows(rows);
  styleHeader(sheet);
}

function addCapacitacionesSheet(workbook, sheetName, rows) {
  const sheet = workbook.addWorksheet(excelSheetName(sheetName));
  sheet.columns = [
    { header: "Curso", key: "curso", width: 26 },
    { header: "Competencia", key: "competencia", width: 20 },
    { header: "Empleado", key: "empleado", width: 28 },
    { header: "Usuario", key: "usuario", width: 16 },
    { header: "Estado", key: "estado", width: 14 },
    { header: "Duración (h)", key: "duracion_horas", width: 14 },
    { header: "Encargado", key: "encargado", width: 20 },
    { header: "Fecha finalización", key: "fecha_finalizacion", width: 16 },
  ];
  sheet.addRows(rows);
  styleHeader(sheet);
}

async function excelResponse(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
    body: Buffer.from(buffer).toString("base64"),
    isBase64Encoded: true,
  };
}

async function exportTiendaExcel(event, id) {
  const query = event.queryStringParameters || {};
  const { data: tienda } = await supabase.from("tiendas").select("nombre").eq("id", id).maybeSingle();
  if (!tienda) throw httpError("Tienda no encontrada.", 404);
  const workbook = new ExcelJS.Workbook();
  const [asistencias, capacitaciones] = await Promise.all([
    fetchAsistenciasExport(id, query.desde, query.hasta),
    fetchCapacitacionesExport(id, query.desde, query.hasta),
  ]);
  addAsistenciasSheet(workbook, "Asistencias", asistencias);
  addCapacitacionesSheet(workbook, "Capacitaciones", capacitaciones);
  return excelResponse(workbook, `${excelSheetName(tienda.nombre)}.xlsx`);
}

async function exportMiHistorialExcel(event, user) {
  const query = event.queryStringParameters || {};
  const rows = await fetchAsistenciasExport(user.tienda_id, query.desde, query.hasta);
  const workbook = new ExcelJS.Workbook();
  addAsistenciasSheet(workbook, "Asistencias", rows);
  return excelResponse(workbook, "mi-tienda-asistencias.xlsx");
}

async function exportTodoExcel(event) {
  const query = event.queryStringParameters || {};
  const tipo = query.tipo === "capacitaciones" ? "capacitaciones" : "asistencias";
  const { data: tiendas, error } = await supabase.from("tiendas").select("id,nombre").order("nombre");
  if (error) throw dbError(error);
  const workbook = new ExcelJS.Workbook();
  for (const tienda of tiendas) {
    const rows = tipo === "capacitaciones"
      ? await fetchCapacitacionesExport(tienda.id, query.desde, query.hasta)
      : await fetchAsistenciasExport(tienda.id, query.desde, query.hasta);
    if (tipo === "capacitaciones") addCapacitacionesSheet(workbook, tienda.nombre, rows);
    else addAsistenciasSheet(workbook, tienda.nombre, rows);
  }
  return excelResponse(workbook, `todas-las-tiendas-${tipo}.xlsx`);
}

// ---------- Router ----------

export async function handler(event) {
  const method = event.httpMethod;
  const path = normalizePath(event);
  try {
    if (method === "OPTIONS") return { statusCode: 204, headers };
    if (path === "/health" && method === "GET") {
      const { error } = await supabase.from("tiendas").select("id", { head: true, count: "exact" });
      if (error) throw dbError(error);
      return json(200, { ok: true, database: "connected" });
    }
    if (path === "/auth/login" && method === "POST") return await login(event);
    if (path === "/auth/logout" && method === "POST") {
      return json(200, { ok: true }, { "Set-Cookie": clearSessionCookie(event) });
    }
    if (path === "/auth/me" && method === "GET") {
      const user = ensureAuth(event);
      return json(200, { user });
    }

    const user = ensureAuth(event);

    if (path === "/perfil" && method === "GET") return json(200, await getPerfil(user));
    if (path === "/mis-asistencias" && method === "GET") return json(200, await misAsistencias(event, user));
    if (path === "/mis-capacitaciones" && method === "GET") return json(200, await misCapacitaciones(user));

    if (path === "/dashboard" && method === "GET") {
      ensureAuth(event, ["admin", "jefe_tienda"]);
      return json(200, await getDashboard(user, event));
    }

    if (path === "/usuarios" && method === "GET") {
      ensureAuth(event, ["admin", "jefe_tienda"]);
      return json(200, await listUsers(user));
    }
    if (path === "/usuarios" && method === "POST") {
      ensureAuth(event, ["admin", "jefe_tienda"]);
      return json(201, await createUser(event, user));
    }
    if (path === "/usuarios/import" && method === "POST") {
      ensureAuth(event, ["admin", "jefe_tienda"]);
      return json(200, await importUsers(event, user));
    }
    if (path === "/usuarios/export.xlsx" && method === "GET") {
      ensureAuth(event, ["admin", "jefe_tienda"]);
      return await exportUsersExcel(user, event.queryStringParameters?.plantilla === "1");
    }
    const userMatch = path.match(/^\/usuarios\/(\d+)$/);
    if (userMatch && method === "PUT") {
      ensureAuth(event, ["admin", "jefe_tienda"]);
      await updateUser(event, Number(userMatch[1]), user);
      return json(200, { ok: true });
    }
    if (userMatch && method === "DELETE") {
      ensureAuth(event, ["admin", "jefe_tienda"]);
      return json(200, await deleteUser(Number(userMatch[1]), user));
    }

    if (path === "/tiendas" && method === "GET") { ensureAuth(event, "admin"); return json(200, await listTiendas()); }
    const tiendaUsersMatch = path.match(/^\/tiendas\/(\d+)\/usuarios$/);
    if (tiendaUsersMatch && method === "GET") {
      ensureAuth(event, "admin");
      return json(200, await listUsers(user, Number(tiendaUsersMatch[1])));
    }
    if (path === "/tiendas" && method === "POST") { ensureAuth(event, "admin"); return json(201, await createTienda(event)); }
    const tiendaMatch = path.match(/^\/tiendas\/(\d+)$/);
    if (tiendaMatch && method === "PUT") {
      ensureAuth(event, "admin");
      await updateTienda(event, Number(tiendaMatch[1]));
      return json(200, { ok: true });
    }

    if (path === "/cursos" && method === "GET") {
      ensureAuth(event, ["admin", "jefe_tienda"]);
      return json(200, await listCursos());
    }
    if (path === "/cursos" && method === "POST") { ensureAuth(event, "admin"); return json(201, await createCurso(event)); }
    const cursoMatch = path.match(/^\/cursos\/(\d+)$/);
    if (cursoMatch && method === "PUT") {
      ensureAuth(event, "admin");
      await updateCurso(event, Number(cursoMatch[1]));
      return json(200, { ok: true });
    }
    if (cursoMatch && method === "DELETE") {
      ensureAuth(event, "admin");
      return json(200, await deleteCurso(Number(cursoMatch[1])));
    }

    if (path === "/encargados" && method === "GET") {
      ensureAuth(event, ["admin", "jefe_tienda"]);
      return json(200, await listEncargados());
    }
    if (path === "/encargados" && method === "POST") { ensureAuth(event, "admin"); return json(201, await createEncargado(event)); }
    const encargadoMatch = path.match(/^\/encargados\/(\d+)$/);
    if (encargadoMatch && method === "PUT") {
      ensureAuth(event, "admin");
      await updateEncargado(event, Number(encargadoMatch[1]));
      return json(200, { ok: true });
    }

    if (path === "/asistencias" && method === "GET") {
      ensureAuth(event, ["admin", "jefe_tienda"]);
      return json(200, await listAsistenciasDia(event, user));
    }
    if (path === "/asistencias/lote" && method === "PUT") {
      ensureAuth(event, "jefe_tienda");
      return json(200, await guardarAsistenciasLote(event, user));
    }
    const asistenciaMatch = path.match(/^\/asistencias\/(\d+)$/);
    if (asistenciaMatch && method === "DELETE") {
      ensureAuth(event, "jefe_tienda");
      await eliminarAsistencia(Number(asistenciaMatch[1]), user);
      return json(200, { ok: true });
    }
    if (path === "/asistencias/historial" && method === "GET") {
      ensureAuth(event, ["admin", "jefe_tienda"]);
      return json(200, await listAsistenciasHistorial(event, user));
    }
    if (path === "/asistencias/log" && method === "GET") {
      ensureAuth(event, "jefe_tienda");
      return json(200, await listLogAsistencias(event, user));
    }
    if (path === "/asistencias/historial/export.xlsx" && method === "GET") {
      ensureAuth(event, "jefe_tienda");
      return await exportMiHistorialExcel(event, user);
    }

    if (path === "/capacitaciones/trabajadores" && method === "GET") {
      ensureAuth(event, "jefe_tienda");
      return json(200, await listTrabajadores(event, user));
    }
    const trabajadorMatch = path.match(/^\/capacitaciones\/trabajadores\/(\d+)$/);
    if (trabajadorMatch && method === "GET") {
      ensureAuth(event, "jefe_tienda");
      return json(200, await getTrabajadorPerfil(Number(trabajadorMatch[1]), user));
    }
    const progresoMatch = path.match(/^\/capacitaciones\/trabajadores\/(\d+)\/cursos\/(\d+)$/);
    if (progresoMatch && method === "PUT") {
      ensureAuth(event, "jefe_tienda");
      await guardarProgreso(event, Number(progresoMatch[1]), Number(progresoMatch[2]), user);
      return json(200, { ok: true });
    }
    if (path === "/capacitaciones/resumen" && method === "GET") {
      ensureAuth(event, ["admin", "jefe_tienda"]);
      return json(200, await getResumenCurso(event, user));
    }
    if (path === "/capacitaciones/asignar" && method === "PUT") {
      ensureAuth(event, "jefe_tienda");
      return json(200, await asignarLote(event, user));
    }

    if (path === "/documentos/todo.xlsx" && method === "GET") {
      ensureAuth(event, "admin");
      return await exportTodoExcel(event);
    }
    const tiendaExportMatch = path.match(/^\/documentos\/tiendas\/(\d+)\.xlsx$/);
    if (tiendaExportMatch && method === "GET") {
      ensureAuth(event, "admin");
      return await exportTiendaExcel(event, Number(tiendaExportMatch[1]));
    }

    return json(404, { error: "Ruta no encontrada." });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    return json(status, { error: error.message || "Ocurrió un error inesperado." });
  }
}
