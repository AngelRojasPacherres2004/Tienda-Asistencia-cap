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
const userRoles = new Set(["gerencia_general", "gerente_comercial", "coach", "jefe_zonal", "jefe_tienda", "asistente_tienda", "jefe_seguridad", "seguridad", "vendedor", "asistente", "trabajador"]);
const centralRoles = new Set(["gerencia_general", "gerente_comercial", "coach", "jefe_zonal"]);
const storeManagementRoles = new Set(["jefe_tienda", "asistente_tienda"]);
const oversightRoles = new Set(["gerencia_general", "gerente_comercial", "coach", "jefe_zonal"]);
const storeStaffRoles = ["jefe_tienda", "asistente_tienda", "jefe_seguridad", "seguridad", "vendedor", "asistente", "trabajador"];
const basicAccessRoles = new Set(["jefe_seguridad", "seguridad", "vendedor", "asistente", "trabajador"]);
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
const disabledPassword = "!SIN_ACCESO!";
const rangosTrafico = new Set([
  "09:00-10:00", "10:00-11:00", "11:00-12:00", "12:00-13:00", "13:00-14:00",
  "14:00-15:00", "15:00-16:00", "16:00-17:00", "17:00-18:00", "18:00-19:00",
  "19:00-20:00", "20:00-21:00", "21:00-22:00",
]);

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
  if (error.code === "23514") {
    return httpError("La base de datos rechazó uno de los valores. Ejecuta las migraciones pendientes y vuelve a intentarlo.", 400);
  }
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code)) {
    return httpError("La estructura de la base de datos no está actualizada. Ejecuta las migraciones pendientes.", 500);
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
    const equivalentRole = user.rol === "jefe_seguridad" ? "seguridad" : ["vendedor", "asistente"].includes(user.rol) ? "trabajador" : user.rol;
    if (!allowed.includes(user.rol) && !allowed.includes(equivalentRole)) throw httpError("No tienes permisos para realizar esta acción.", 403);
  }
  return user;
}

async function withStoreName(user) {
  if (!user.tienda_id) return { ...user, tienda_nombre: null };
  const { data: store, error } = await supabase.from("tiendas").select("nombre").eq("id", user.tienda_id).maybeSingle();
  if (error) throw dbError(error);
  return { ...user, tienda_nombre: store?.nombre || null };
}

// ---------- Validación ----------

function cleanUsuario(value) {
  return cleanText(value).toLowerCase();
}

function validateUserPayload(data, creating = false) {
  requireFields(data, ["nombres", "apellidos", "dni", "usuario", "rol", "estado", "fecha_ingreso", ...(creating && !basicAccessRoles.has(data.rol) ? ["password"] : [])]);
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
  if (centralRoles.has(data.rol) && data.tienda_id) {
    throw httpError("Gerentes y jefes zonales no llevan una única tienda asignada.", 400);
  }
  if (!centralRoles.has(data.rol) && !data.tienda_id) {
    throw httpError("Selecciona la tienda del usuario.", 400);
  }
  if (data.password && String(data.password).length < 6) {
    throw httpError("La contraseña debe tener al menos 6 caracteres.", 400);
  }
  if (!isISODate(data.fecha_ingreso)) throw httpError("La fecha de ingreso no es válida.", 400);
  if (data.fecha_salida && (!isISODate(data.fecha_salida) || data.fecha_salida < data.fecha_ingreso)) {
    throw httpError("La fecha de salida debe ser válida y posterior a la fecha de ingreso.", 400);
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
  if (!account.password || account.password === disabledPassword) return fail();
  const valid = await bcrypt.compare(String(password), account.password);
  if (!valid) return fail();

  loginAttempts.delete(clientIp);
  const sessionUser = {
    id: account.id, nombres: account.nombres, apellidos: account.apellidos,
    usuario: account.usuario, rol: account.rol, tienda_id: account.tienda_id,
  };
  const token = jwt.sign(sessionUser, jwtSecret(), { expiresIn: "10h" });
  const user = await withStoreName(sessionUser);
  return json(200, { user }, { "Set-Cookie": sessionCookie(token, event) });
}

// ---------- Usuarios ----------

function mapUserRow(row) {
  const { tiendas, ...rest } = row;
  return { ...rest, tienda_nombre: tiendas?.nombre || null };
}

async function zonalStoreIds(userId) {
  const { data: cluster, error: clusterError } = await supabase.from("clusters").select("id").eq("jefe_zonal_id", userId).maybeSingle();
  if (clusterError) throw dbError(clusterError);
  if (!cluster) return [];
  const { data, error } = await supabase.from("tiendas").select("id").eq("cluster_id", cluster.id);
  if (error) throw dbError(error);
  return (data || []).map((row) => row.id);
}

async function resolveStoreScope(user, requestedStoreId = null) {
  const requestedId = requestedStoreId ? Number(requestedStoreId) : null;
  if (requestedId && (!Number.isInteger(requestedId) || requestedId < 1)) {
    throw httpError("La tienda seleccionada no es válida.", 400);
  }
  if (["gerencia_general", "gerente_comercial", "coach"].includes(user.rol)) return requestedId || null;
  if (user.rol === "jefe_zonal") {
    const ids = await zonalStoreIds(user.id);
    if (requestedId && !ids.includes(requestedId)) throw httpError("La tienda no pertenece a tu clúster.", 403);
    return requestedId || ids;
  }
  if (storeManagementRoles.has(user.rol)) {
    if (requestedId && Number(user.tienda_id) !== requestedId) throw httpError("Solo puedes consultar los datos de tu tienda.", 403);
    return user.tienda_id;
  }
  return user.tienda_id || null;
}

function allowedCreatedRoles(actor) {
  if (actor.rol === "gerencia_general") return new Set(["gerente_comercial", "coach"]);
  if (actor.rol === "gerente_comercial") return new Set(["jefe_zonal"]);
  if (actor.rol === "jefe_zonal") return new Set(["jefe_tienda"]);
  if (actor.rol === "jefe_tienda") return new Set(["asistente_tienda", "jefe_seguridad", "seguridad", "vendedor", "asistente", "trabajador"]);
  if (actor.rol === "asistente_tienda") return new Set(["jefe_seguridad", "seguridad", "vendedor", "asistente", "trabajador"]);
  return new Set();
}

async function assertUserScope(actor, role, tiendaId) {
  if (!allowedCreatedRoles(actor).has(role)) throw httpError("No puedes administrar usuarios de ese rango.", 403);
  if (actor.rol === "jefe_zonal") {
    const ids = await zonalStoreIds(actor.id);
    if (!ids.includes(Number(tiendaId))) throw httpError("La tienda no está asignada a tu zona.", 403);
  }
  if (storeManagementRoles.has(actor.rol) && Number(tiendaId) !== Number(actor.tienda_id)) {
    throw httpError("Solo puedes administrar usuarios de tu tienda.", 403);
  }
}

async function listUsers(actor, storeId = null) {
  if (actor.rol === "jefe_zonal" && storeId) {
    const ids = await zonalStoreIds(actor.id);
    if (!ids.includes(Number(storeId))) throw httpError("La tienda no está asignada a tu zona.", 403);
  }
  let request = supabase
    .from("usuarios")
    .select("id,nombres,apellidos,dni,usuario,telefono,email,fecha_nacimiento,sueldo,sexo,direccion,distrito,grado_academico,ciclo_semestre,puesto,estado_civil,numero_hijos,talla_zapatillas,talla_polo,telefono_emergencia,alergia,condicion_salud,rol,tienda_id,estado,fecha_ingreso,fecha_salida,fecha_creacion,tiendas!usuarios_tienda_id_fkey(nombre)")
    .order("nombres");
  if (actor.rol === "gerencia_general" && !storeId) request = request.in("rol", ["gerente_comercial", "coach"]);
  if (actor.rol === "gerente_comercial" && !storeId) request = request.eq("rol", "jefe_zonal");
  if (actor.rol === "jefe_zonal" && !storeId) {
    const ids = await zonalStoreIds(actor.id);
    if (!ids.length) return [];
    request = request.eq("rol", "jefe_tienda").in("tienda_id", ids);
  }
  if (actor.rol === "jefe_tienda") request = request.eq("tienda_id", actor.tienda_id).in("rol", ["asistente_tienda", "jefe_seguridad", "seguridad", "vendedor", "asistente", "trabajador"]);
  if (actor.rol === "asistente_tienda") request = request.eq("tienda_id", actor.tienda_id).in("rol", ["jefe_seguridad", "seguridad", "vendedor", "asistente", "trabajador"]);
  if (storeId) request = request.eq("tienda_id", storeId);
  const { data, error } = await request;
  if (error) throw dbError(error);
  const { data: optionalRows } = await supabase.from("usuarios").select("id,contacto_emergencia,motivo_salida").in("id", data.map((row) => row.id));
  const optionalById = new Map((optionalRows || []).map((row) => [row.id, row]));
  const rows = data.map((row) => ({ ...mapUserRow(row), ...(optionalById.get(row.id) || {}) }));
  if (["gerencia_general", "gerente_comercial"].includes(actor.rol) && rows.some((row) => row.rol === "jefe_zonal")) {
    const { data: assignments, error: assignmentError } = await supabase
      .from("clusters").select("id,nombre,jefe_zonal_id,tiendas(id)").in("jefe_zonal_id", rows.filter((row) => row.rol === "jefe_zonal").map((row) => row.id));
    if (assignmentError) throw dbError(assignmentError);
    for (const row of rows) {
      const cluster = (assignments || []).find((item) => item.jefe_zonal_id === row.id);
      row.cluster_id = cluster?.id || null; row.cluster_nombre = cluster?.nombre || null; row.tienda_ids = (cluster?.tiendas || []).map((item) => item.id);
    }
  }
  return rows;
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

async function ensureStoreWithoutOtherChief(tiendaId, excludeUserId = null) {
  let request = supabase.from("usuarios").select("id").eq("tienda_id", tiendaId).eq("rol", "jefe_tienda");
  if (excludeUserId) request = request.neq("id", excludeUserId);
  const { data, error } = await request.limit(1);
  if (error) throw dbError(error);
  if (data?.length) throw httpError("La tienda ya tiene un administrador asignado.", 409);
}

async function linkStoreChief(userId, tiendaId, previousStoreId = null) {
  if (previousStoreId && Number(previousStoreId) !== Number(tiendaId)) {
    const { error } = await supabase.from("tiendas").update({ jefe_id: null }).eq("id", previousStoreId).eq("jefe_id", userId);
    if (error) throw dbError(error);
  }
  const { error } = await supabase.from("tiendas").update({ jefe_id: userId }).eq("id", tiendaId);
  if (error) throw dbError(error);
}

async function validateZonalCluster(clusterId, zonalId = null) {
  if (!clusterId) throw httpError("Selecciona un clúster para el jefe zonal.", 400);
  const { data, error } = await supabase.from("clusters")
    .select("id,estado,jefe_zonal_id").eq("id", Number(clusterId)).maybeSingle();
  if (error) throw dbError(error);
  if (!data || data.estado !== "activo") throw httpError("Selecciona un clúster activo.", 400);
  if (data.jefe_zonal_id && Number(data.jefe_zonal_id) !== Number(zonalId)) {
    throw httpError("Ese clúster ya tiene un jefe zonal asignado.", 409);
  }
  return data;
}

async function assignZonalCluster(zonalId, clusterId) {
  const { data: previous, error: previousError } = await supabase.from("clusters")
    .select("id").eq("jefe_zonal_id", zonalId).maybeSingle();
  if (previousError) throw dbError(previousError);
  if (previous && Number(previous.id) !== Number(clusterId)) {
    const { error } = await supabase.from("clusters").update({ jefe_zonal_id: null }).eq("id", previous.id);
    if (error) throw dbError(error);
  }
  const { error } = await supabase.from("clusters").update({ jefe_zonal_id: zonalId }).eq("id", Number(clusterId));
  if (error) {
    if (previous && Number(previous.id) !== Number(clusterId)) {
      await supabase.from("clusters").update({ jefe_zonal_id: zonalId }).eq("id", previous.id);
    }
    throw dbError(error);
  }
}

async function createUser(event, actor) {
  const data = bodyOf(event);
  if (storeManagementRoles.has(actor.rol)) {
    data.tienda_id = actor.tienda_id;
  }
  validateUserPayload(data, true);
  await assertUserScope(actor, data.rol, data.tienda_id);
  if (actor.rol === "gerente_comercial" && data.rol === "jefe_zonal") await validateZonalCluster(data.cluster_id);
  const usuario = cleanUsuario(data.usuario);
  const dni = cleanText(data.dni);
  await ensureUniqueUser(usuario, dni);
  if (!centralRoles.has(data.rol)) await ensureTiendaActiva(data.tienda_id);
  if (data.rol === "jefe_tienda") await ensureStoreWithoutOtherChief(Number(data.tienda_id));
  const password = data.password ? await bcrypt.hash(String(data.password), 12) : disabledPassword;
  const { data: created, error } = await supabase.from("usuarios").insert({
    nombres: cleanText(data.nombres), apellidos: cleanText(data.apellidos), dni, usuario, password,
    telefono: data.telefono ? cleanText(data.telefono) : null, email: data.email ? cleanText(data.email).toLowerCase() : null, rol: data.rol,
    tienda_id: centralRoles.has(data.rol) ? null : Number(data.tienda_id), estado: data.estado,
    fecha_ingreso: data.fecha_ingreso, fecha_salida: data.fecha_salida || null,
    condicion_salud: data.condicion_salud ? cleanText(data.condicion_salud) : null,
    fecha_nacimiento: data.fecha_nacimiento || null, sueldo: data.sueldo === "" || data.sueldo == null ? null : Number(data.sueldo),
    sexo: data.sexo || null, direccion: data.direccion ? cleanText(data.direccion) : null, distrito: data.distrito ? cleanText(data.distrito) : null,
    grado_academico: data.grado_academico || null, ciclo_semestre: data.ciclo_semestre ? cleanText(data.ciclo_semestre) : null,
    puesto: data.puesto ? cleanText(data.puesto) : null, estado_civil: data.estado_civil || null,
    numero_hijos: data.numero_hijos === "" || data.numero_hijos == null ? null : Number(data.numero_hijos),
    talla_zapatillas: data.talla_zapatillas === "" || data.talla_zapatillas == null ? null : Number(data.talla_zapatillas),
    talla_polo: data.talla_polo || null,
    telefono_emergencia: data.telefono_emergencia ? cleanText(data.telefono_emergencia) : null,
    alergia: data.alergia ? cleanText(data.alergia) : null,
  }).select("id,nombres,apellidos,dni,usuario,telefono,rol,tienda_id,estado,fecha_ingreso,fecha_salida").single();
  if (error) throw dbError(error);
  await saveOptionalPersonnelFields(created.id, data);
  if (data.rol === "jefe_tienda") await linkStoreChief(created.id, Number(data.tienda_id));
  if (data.rol === "jefe_zonal") {
    try {
      await assignZonalCluster(created.id, Number(data.cluster_id));
    } catch (assignError) {
      await supabase.from("usuarios").delete().eq("id", created.id);
      throw assignError;
    }
  }
  return created;
}

async function importStoreUsers(event, actor) {
  const { usuarios } = bodyOf(event);
  if (!Array.isArray(usuarios) || !usuarios.length) throw httpError("El Excel no contiene usuarios para importar.", 400);
  if (usuarios.length > 500) throw httpError("Solo puedes importar hasta 500 usuarios por archivo.", 400);

  const prepared = usuarios.map((row, index) => {
    const data = {
      ...row, rol: "trabajador", tienda_id: actor.tienda_id, estado: "activo", fecha_salida: null,
    };
    try { validateUserPayload(data, true); } catch (error) {
      throw httpError(`Fila ${index + 2}: ${error.message}`, error.status || 400);
    }
    return {
      nombres: cleanText(data.nombres), apellidos: cleanText(data.apellidos), dni: cleanText(data.dni),
      usuario: cleanUsuario(data.usuario), telefono: data.telefono ? cleanText(data.telefono) : null,
      password: data.password ? String(data.password) : disabledPassword, rol: "trabajador", tienda_id: actor.tienda_id, estado: "activo",
      fecha_ingreso: data.fecha_ingreso, fecha_salida: null,
    };
  });
  const usuariosSet = new Set();
  const dniSet = new Set();
  for (const row of prepared) {
    if (usuariosSet.has(row.usuario)) throw httpError(`El usuario "${row.usuario}" está repetido en el Excel.`, 400);
    if (dniSet.has(row.dni)) throw httpError(`El DNI "${row.dni}" está repetido en el Excel.`, 400);
    usuariosSet.add(row.usuario); dniSet.add(row.dni);
  }
  const [{ data: existingUsers, error: userError }, { data: existingDnis, error: dniError }] = await Promise.all([
    supabase.from("usuarios").select("id,usuario,dni").in("usuario", [...usuariosSet]),
    supabase.from("usuarios").select("id,usuario,dni").in("dni", [...dniSet]),
  ]);
  if (userError) throw dbError(userError);
  if (dniError) throw dbError(dniError);
  const byUsuario = new Map((existingUsers || []).map((row) => [cleanUsuario(row.usuario), row]));
  const byDni = new Map((existingDnis || []).map((row) => [row.dni, row]));
  const nuevos = prepared.filter((row) => {
    const sameUsuario = byUsuario.get(row.usuario);
    const sameDni = byDni.get(row.dni);
    if (!sameUsuario && !sameDni) return true;
    if (sameUsuario?.id === sameDni?.id) return false;
    if (sameUsuario) throw httpError(`El usuario "${row.usuario}" ya pertenece a otro DNI.`, 409);
    throw httpError(`El DNI "${row.dni}" ya pertenece a otro usuario.`, 409);
  });

  const rows = await Promise.all(nuevos.map(async (row) => ({
    ...row, password: row.password === disabledPassword ? disabledPassword : await bcrypt.hash(row.password, 12),
  })));
  if (rows.length) {
    const { error } = await supabase.from("usuarios").insert(rows);
    if (error) throw dbError(error);
  }
  return { creados: rows.length, omitidos: prepared.length - rows.length };
}

async function updateUser(event, id, actor) {
  const data = bodyOf(event);
  const { data: current } = await supabase.from("usuarios").select("rol,estado,tienda_id,password").eq("id", id).maybeSingle();
  if (!current) throw httpError("Usuario no encontrado.", 404);
  if (storeManagementRoles.has(actor.rol)) data.tienda_id = actor.tienda_id;
  validateUserPayload(data);
  await assertUserScope(actor, current.rol, current.tienda_id);
  if (data.rol !== current.rol) throw httpError("No se permite cambiar el rango de un usuario existente.", 400);
  if (actor.rol === "gerente_comercial" && data.rol === "jefe_zonal") await validateZonalCluster(data.cluster_id, id);
  if (!basicAccessRoles.has(data.rol) && (!current.password || current.password === disabledPassword) && !data.password) {
    throw httpError("Asigna una contraseña antes de otorgar este rol.", 400);
  }
  const usuario = cleanUsuario(data.usuario);
  const dni = cleanText(data.dni);
  await ensureUniqueUser(usuario, dni, id);
  if (!centralRoles.has(data.rol)) await ensureTiendaActiva(data.tienda_id);
  if (data.rol === "jefe_tienda") await ensureStoreWithoutOtherChief(Number(data.tienda_id), id);
  const payload = {
    nombres: cleanText(data.nombres), apellidos: cleanText(data.apellidos), dni, usuario,
    telefono: data.telefono ? cleanText(data.telefono) : null, email: data.email ? cleanText(data.email).toLowerCase() : null, rol: data.rol,
    tienda_id: centralRoles.has(data.rol) ? null : Number(data.tienda_id), estado: data.estado,
    fecha_ingreso: data.fecha_ingreso, fecha_salida: data.fecha_salida || null,
    condicion_salud: data.condicion_salud ? cleanText(data.condicion_salud) : null,
    fecha_nacimiento: data.fecha_nacimiento || null, sueldo: data.sueldo === "" || data.sueldo == null ? null : Number(data.sueldo),
    sexo: data.sexo || null, direccion: data.direccion ? cleanText(data.direccion) : null, distrito: data.distrito ? cleanText(data.distrito) : null,
    grado_academico: data.grado_academico || null, ciclo_semestre: data.ciclo_semestre ? cleanText(data.ciclo_semestre) : null,
    puesto: data.puesto ? cleanText(data.puesto) : null, estado_civil: data.estado_civil || null,
    numero_hijos: data.numero_hijos === "" || data.numero_hijos == null ? null : Number(data.numero_hijos),
    talla_zapatillas: data.talla_zapatillas === "" || data.talla_zapatillas == null ? null : Number(data.talla_zapatillas),
    talla_polo: data.talla_polo || null,
    telefono_emergencia: data.telefono_emergencia ? cleanText(data.telefono_emergencia) : null,
    alergia: data.alergia ? cleanText(data.alergia) : null,
  };
  if (data.password) payload.password = await bcrypt.hash(String(data.password), 12);
  const { error } = await supabase.from("usuarios").update(payload).eq("id", id);
  if (error) throw dbError(error);
  await saveOptionalPersonnelFields(id, data);
  if (data.rol === "jefe_tienda") await linkStoreChief(id, Number(data.tienda_id), current.tienda_id);
  if (data.rol === "jefe_zonal") await assignZonalCluster(id, Number(data.cluster_id));
}

async function saveOptionalPersonnelFields(id, data) {
  const { error } = await supabase.from("usuarios").update({
    contacto_emergencia: data.contacto_emergencia ? cleanText(data.contacto_emergencia) : null,
    motivo_salida: data.motivo_salida ? cleanText(data.motivo_salida) : null,
  }).eq("id", id);
  if (error && !["42703", "PGRST204"].includes(error.code)) throw dbError(error);
}

async function deleteUser(id, actor) {
  const { data: target, error } = await supabase.from("usuarios").select("id,tienda_id,rol").eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!target) throw httpError("Usuario no encontrado.", 404);
  await assertUserScope(actor, target.rol, target.tienda_id);
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

async function importUsersAdmin(event, actor) {
  const body = bodyOf(event);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length || rows.length > 200) throw httpError("El archivo debe contener entre 1 y 200 usuarios.", 400);
  const results = [];
  for (let index = 0; index < rows.length; index += 1) {
    try {
      const data = { ...rows[index] };
      if (storeManagementRoles.has(actor.rol)) data.tienda_id = actor.tienda_id;
      validateUserPayload(data, true);
      await assertUserScope(actor, data.rol, data.tienda_id);
      const usuario = cleanUsuario(data.usuario);
      const dni = cleanText(data.dni);
      await ensureUniqueUser(usuario, dni);
      if (!centralRoles.has(data.rol)) await ensureTiendaActiva(data.tienda_id);
      const password = data.password ? await bcrypt.hash(String(data.password), 12) : disabledPassword;
      const { error } = await supabase.from("usuarios").insert({
        nombres: cleanText(data.nombres), apellidos: cleanText(data.apellidos), dni, usuario, password,
        telefono: data.telefono ? cleanText(data.telefono) : null, rol: data.rol,
        tienda_id: centralRoles.has(data.rol) ? null : Number(data.tienda_id), estado: data.estado,
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

async function exportUsersExcelAdmin(actor, template = false) {
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

// ---------- Clústeres y tiendas ----------

async function listClusters() {
  const { data, error } = await supabase.from("clusters")
    .select("id,nombre,codigo,estado,jefe_zonal_id,created_at,jefe:usuarios!clusters_jefe_zonal_id_fkey(id,nombres,apellidos,usuario),tiendas(id,nombre,estado)")
    .order("nombre");
  if (error) throw dbError(error);
  return data.map(({ jefe, tiendas, ...row }) => ({ ...row, jefe_nombre: jefe ? `${jefe.nombres} ${jefe.apellidos}` : null, jefe_usuario: jefe?.usuario || null, tiendas: tiendas || [] }));
}

async function validateClusterChief(jefeId, currentClusterId = null) {
  if (!jefeId) return;
  const { data: jefe } = await supabase.from("usuarios").select("id,rol,estado").eq("id", jefeId).maybeSingle();
  if (!jefe || jefe.rol !== "jefe_zonal" || jefe.estado !== "activo") throw httpError("Selecciona un jefe zonal activo.", 400);
  let request = supabase.from("clusters").select("id").eq("jefe_zonal_id", jefeId);
  if (currentClusterId) request = request.neq("id", currentClusterId);
  const { data } = await request.limit(1);
  if (data?.length) throw httpError("Ese jefe zonal ya pertenece a otro clúster.", 409);
}

async function syncClusterStores(clusterId, storeIds) {
  const ids = validIds(storeIds || []);
  const { error: clearError } = ids.length
    ? await supabase.from("tiendas").update({ cluster_id: null }).eq("cluster_id", clusterId).not("id", "in", `(${ids.join(",")})`)
    : await supabase.from("tiendas").update({ cluster_id: null }).eq("cluster_id", clusterId);
  if (clearError) throw dbError(clearError);
  if (!ids.length) return;
  const { data: stores, error: storeError } = await supabase.from("tiendas").select("id").in("id", ids);
  if (storeError) throw dbError(storeError);
  if (stores.length !== ids.length) throw httpError("Una de las tiendas seleccionadas no existe.", 400);
  const { error } = await supabase.from("tiendas").update({ cluster_id: clusterId }).in("id", ids);
  if (error) throw dbError(error);
}

async function createCluster(event) {
  const data = bodyOf(event);
  requireFields(data, ["nombre", "codigo"]);
  const jefeId = data.jefe_zonal_id ? Number(data.jefe_zonal_id) : null;
  await validateClusterChief(jefeId);
  const { data: row, error } = await supabase.from("clusters").insert({ nombre: cleanText(data.nombre), codigo: cleanText(data.codigo).toUpperCase(), jefe_zonal_id: jefeId, estado: data.estado || "activo" }).select().single();
  if (error) throw dbError(error);
  await syncClusterStores(row.id, data.tienda_ids);
  return row;
}

async function updateCluster(event, id) {
  const data = bodyOf(event);
  requireFields(data, ["nombre", "codigo"]);
  const jefeId = data.jefe_zonal_id ? Number(data.jefe_zonal_id) : null;
  await validateClusterChief(jefeId, id);
  const { error } = await supabase.from("clusters").update({ nombre: cleanText(data.nombre), codigo: cleanText(data.codigo).toUpperCase(), jefe_zonal_id: jefeId, estado: data.estado || "activo", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw dbError(error);
  await syncClusterStores(id, data.tienda_ids);
}

async function deleteCluster(id) {
  const { data: cluster, error: findError } = await supabase.from("clusters").select("id,nombre").eq("id", id).maybeSingle();
  if (findError) throw dbError(findError);
  if (!cluster) throw httpError("El clúster no existe.", 404);
  const { error: unlinkError } = await supabase.from("tiendas").update({ cluster_id: null }).eq("cluster_id", id);
  if (unlinkError) throw dbError(unlinkError);
  const { error } = await supabase.from("clusters").delete().eq("id", id);
  if (error) throw dbError(error);
  return { eliminado: true, nombre: cluster.nombre };
}

async function listTiendas(actor) {
  let request = supabase
    .from("tiendas")
    .select("id,nombre,direccion,estado,fecha_creacion,jefe_id,cluster_id,jefe:usuarios!tiendas_jefe_fk(id,nombres,apellidos),cluster:clusters(id,nombre,codigo)")
    .order("nombre");
  if (actor?.rol === "jefe_zonal") {
    const ids = await zonalStoreIds(actor.id);
    if (!ids.length) return [];
    request = request.in("id", ids);
  }
  const { data, error } = await request;
  if (error) throw dbError(error);
  return data.map(({ jefe, cluster, ...row }) => ({
    ...row,
    jefe_nombre: jefe ? `${jefe.nombres} ${jefe.apellidos}` : null,
    cluster_nombre: cluster?.nombre || null,
  }));
}

async function syncJefe(tiendaId, jefeId) {
  const { data: jefe } = await supabase.from("usuarios").select("id,rol,tienda_id,estado").eq("id", jefeId).maybeSingle();
  if (!jefe || jefe.estado !== "activo") throw httpError("El usuario seleccionado como jefe no existe o está inactivo.", 400);
  if (jefe.rol !== "jefe_tienda") throw httpError("Selecciona un jefe de tienda activo.", 400);
  if (jefe.tienda_id !== tiendaId) throw httpError("El administrador debe pertenecer a esta tienda.", 400);
}

async function ensureClusterActive(clusterId) {
  const { data, error } = await supabase.from("clusters").select("id,estado").eq("id", clusterId).maybeSingle();
  if (error) throw dbError(error);
  if (!data || data.estado !== "activo") throw httpError("Selecciona un clúster activo.", 400);
}

async function createTienda(event) {
  const data = bodyOf(event);
  validateTiendaPayload(data);
  if (!data.cluster_id) throw httpError("Selecciona el clúster de la tienda.", 400);
  await ensureClusterActive(Number(data.cluster_id));
  const { data: created, error } = await supabase.from("tiendas")
    .insert({
      nombre: cleanText(data.nombre),
      direccion: data.direccion ? cleanText(data.direccion) : null,
      estado: data.estado, cluster_id: data.cluster_id ? Number(data.cluster_id) : null,
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
  if (!data.cluster_id) throw httpError("Selecciona el clúster de la tienda.", 400);
  await ensureClusterActive(Number(data.cluster_id));
  const jefeId = data.jefe_id ? Number(data.jefe_id) : null;
  if (jefeId) await syncJefe(Number(id), jefeId);
  const { error } = await supabase.from("tiendas").update({
    nombre: cleanText(data.nombre),
    direccion: data.direccion ? cleanText(data.direccion) : null,
    estado: data.estado,
    jefe_id: jefeId, cluster_id: data.cluster_id ? Number(data.cluster_id) : null,
  }).eq("id", id);
  if (error) throw dbError(error);
}

// ---------- Asistencias ----------

async function listAsistenciasDia(event, user) {
  const query = event.queryStringParameters || {};
  const tiendaScope = await resolveStoreScope(user, query.tienda_id);
  const fecha = query.fecha && isISODate(query.fecha) ? query.fecha : todayISO();
  let empleadosQuery = supabase.from("usuarios").select("id,nombres,apellidos,dni,estado")
    .in("rol", storeStaffRoles).order("nombres");
  empleadosQuery = applyStoreScope(empleadosQuery, tiendaScope);
  if (query.estado === "activo" || query.estado === "inactivo") empleadosQuery = empleadosQuery.eq("estado", query.estado);
  let registrosQuery = supabase.from("asistencias").select("*").eq("fecha", fecha);
  registrosQuery = applyStoreScope(registrosQuery, tiendaScope);
  const [{ data: empleados, error: e1 }, { data: registros, error: e2 }] = await Promise.all([
    empleadosQuery,
    registrosQuery,
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
  const tiendaScope = await resolveStoreScope(user, query.tienda_id);
  const desde = query.desde && isISODate(query.desde) ? query.desde : `${todayISO().slice(0, 7)}-01`;
  const hasta = query.hasta && isISODate(query.hasta) ? query.hasta : todayISO();
  const ascending = query.orden === "asc";
  let request = supabase.from("asistencias")
    .select("*, usuarios!asistencias_usuario_id_fkey!inner(nombres,apellidos,usuario,estado)")
    .gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending });
  request = applyStoreScope(request, tiendaScope);
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

function trainingTargetRoles(role) {
  if (["gerencia_general", "gerente_comercial"].includes(role)) return storeStaffRoles;
  if (role === "coach") return ["gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda", "jefe_seguridad", "seguridad", "vendedor", "asistente", "trabajador"];
  if (role === "jefe_zonal") return ["jefe_tienda"];
  if (role === "jefe_tienda") return ["asistente_tienda", "jefe_seguridad", "seguridad", "vendedor", "asistente", "trabajador"];
  if (role === "asistente_tienda") return ["jefe_seguridad", "seguridad", "vendedor", "asistente", "trabajador"];
  return [];
}

async function listTrabajadores(event, user) {
  const query = event.queryStringParameters || {};
  const targetRoles = trainingTargetRoles(user.rol);
  let request = supabase.from("usuarios")
    .select("id,nombres,apellidos,usuario,rol,estado,tienda_id,tiendas!usuarios_tienda_id_fkey(nombre)");
  request = request.in("rol", targetRoles.length ? targetRoles : ["__sin_acceso__"]);
  if (user.rol === "jefe_zonal") {
    const ids = await zonalStoreIds(user.id);
    if (!ids.length) return [];
    request = request.in("tienda_id", ids);
  } else if (["jefe_tienda", "asistente_tienda"].includes(user.rol)) {
    request = request.eq("tienda_id", user.tienda_id);
  }
  request = request.order("nombres");
  if (query.estado === "activo" || query.estado === "inactivo") request = request.eq("estado", query.estado);
  const { data, error } = await request;
  if (error) throw dbError(error);
  const people = data.map(({ tiendas, ...row }) => ({ ...row, tienda_nombre: tiendas?.nombre || null }));
  if (!query.curso_id) return people;
  const cursoId = Number(query.curso_id);
  const ids = people.map((t) => t.id);
  const { data: progreso, error: pError } = await supabase.from("capacitacion_progreso")
    .select("usuario_id,estado").eq("curso_id", cursoId).in("usuario_id", ids.length ? ids : [0]);
  if (pError) throw dbError(pError);
  const byUser = new Map(progreso.map((row) => [row.usuario_id, row.estado]));
  return people.map((t) => ({ ...t, progreso_estado: byUser.get(t.id) || "pendiente" }));
}

async function assertTrainingTarget(user, target) {
  if (!target) throw httpError("Persona no encontrada.", 404);
  if (!trainingTargetRoles(user.rol).includes(target.rol)) throw httpError("La persona no está bajo tu supervisión.", 403);
  if (["gerencia_general", "gerente_comercial", "coach"].includes(user.rol)) {
    return;
  }
  if (user.rol === "jefe_zonal") {
    const ids = await zonalStoreIds(user.id);
    if (!ids.includes(Number(target.tienda_id))) throw httpError("La persona no pertenece a tu clúster.", 403);
    return;
  }
  if (Number(target.tienda_id) !== Number(user.tienda_id)) throw httpError("La persona no pertenece a tu tienda.", 403);
}

async function getTrabajadorPerfil(id, user) {
  const { data: trabajador, error } = await supabase.from("usuarios")
    .select("id,nombres,apellidos,usuario,rol,estado,tienda_id").eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  await assertTrainingTarget(user, trabajador);

  const { data: progresoRows, error: progresoError } = await supabase.from("capacitacion_progreso")
    .select("curso_id,estado,duracion_horas,fecha_finalizacion")
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
  requireFields(data, ["estado"]);
  if (!progresoEstados.has(data.estado)) throw httpError("El estado no es válido.", 400);
  const { data: trabajador, error: tError } = await supabase.from("usuarios")
    .select("id,tienda_id,rol").eq("id", usuarioId).maybeSingle();
  if (tError) throw dbError(tError);
  await assertTrainingTarget(user, trabajador);
  const payload = {
    curso_id: Number(cursoId), usuario_id: Number(usuarioId), tienda_id: trabajador.tienda_id,
    estado: data.estado, duracion_horas: data.duracion_horas ? Number(data.duracion_horas) : null,
    encargado_id: null,
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
  const tiendaId = oversightRoles.has(user.rol) ? (query.tienda_id ? Number(query.tienda_id) : null) : user.tienda_id;

  let trabajadoresQuery = supabase.from("usuarios").select("id,nombres,apellidos,usuario,rol,tienda_id")
    .eq("estado", "activo").in("rol", trainingTargetRoles(user.rol));
  if (user.rol === "jefe_zonal") {
    const ids = await zonalStoreIds(user.id);
    if (tiendaId && !ids.includes(tiendaId)) throw httpError("La tienda no pertenece a tu clúster.", 403);
    trabajadoresQuery = trabajadoresQuery.in("tienda_id", tiendaId ? [tiendaId] : (ids.length ? ids : [0]));
  } else {
    if (["jefe_tienda", "asistente_tienda"].includes(user.rol)) trabajadoresQuery = trabajadoresQuery.eq("tienda_id", user.tienda_id);
    else if (tiendaId) trabajadoresQuery = trabajadoresQuery.eq("tienda_id", tiendaId);
  }
  const { data: trabajadores, error: tError } = await trabajadoresQuery;
  if (tError) throw dbError(tError);

  const ids = trabajadores.map((t) => t.id);
  const { data: progresoRows, error: pError } = await supabase.from("capacitacion_progreso")
    .select("usuario_id,estado,duracion_horas,fecha_finalizacion")
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
    .select("id,tienda_id,rol").in("id", ids);
  if (tError) throw dbError(tError);
  if (trabajadores.length !== ids.length) throw httpError("Una de las personas seleccionadas no existe.", 400);
  for (const trabajador of trabajadores) await assertTrainingTarget(user, trabajador);
  const fechaFinalizacion = data.estado === "completado" ? todayISO() : null;
  const rows = ids.map((usuario_id) => {
    const row = {
      curso_id: cursoId, usuario_id, tienda_id: trabajadores.find((item) => item.id === usuario_id).tienda_id, estado: data.estado,
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
    .select("curso_id,estado,duracion_horas,fecha_finalizacion,cursos(id,nombre,competencia,activo)")
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
      fecha_finalizacion: progreso?.fecha_finalizacion ?? null,
    };
  }).sort((a, b) => a.titulo.localeCompare(b.titulo));
}

// ---------- Perfil ----------

async function getPerfil(user) {
  const { data, error } = await supabase.from("usuarios")
    .select("id,nombres,apellidos,dni,usuario,telefono,rol,estado,fecha_creacion,tienda_id,tiendas!usuarios_tienda_id_fkey(nombre,direccion,estado)")
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
    tienda_direccion: data.tiendas?.direccion || null, tienda_estado: data.tiendas?.estado || null,
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

function hasStoreScope(scope) {
  return scope !== null && scope !== undefined;
}

function applyStoreScope(request, scope) {
  if (!hasStoreScope(scope)) return request;
  return Array.isArray(scope) ? request.in("tienda_id", scope.length ? scope : [0]) : request.eq("tienda_id", scope);
}

async function getSummary(tiendaFilter, today, monthStart) {
  const [tiendasActivas, usuariosActivos, hoyPresentes, mesTotal, mesPresentes, cursosEnCurso] = await Promise.all([
    countRows("tiendas", (q) => {
      const active = q.eq("estado", "activo");
      if (!hasStoreScope(tiendaFilter)) return active;
      return Array.isArray(tiendaFilter) ? active.in("id", tiendaFilter.length ? tiendaFilter : [0]) : active.eq("id", tiendaFilter);
    }),
    countRows("usuarios", (q) => {
      const scoped = q.eq("estado", "activo").in("rol", storeStaffRoles);
      return applyStoreScope(scoped, tiendaFilter);
    }),
    countRows("asistencias", (q) => {
      const scoped = q.eq("fecha", today).in("estado", [...presenteEstados]);
      return applyStoreScope(scoped, tiendaFilter);
    }),
    countRows("asistencias", (q) => {
      const scoped = q.gte("fecha", monthStart).lte("fecha", today);
      return applyStoreScope(scoped, tiendaFilter);
    }),
    countRows("asistencias", (q) => {
      const scoped = q.gte("fecha", monthStart).lte("fecha", today).in("estado", [...presenteEstados]);
      return applyStoreScope(scoped, tiendaFilter);
    }),
    countRows("capacitacion_progreso", (q) => {
      const scoped = q.eq("estado", "en_curso");
      return applyStoreScope(scoped, tiendaFilter);
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
  request = applyStoreScope(request, tiendaFilter);
  const { data, error } = await request;
  if (error) throw dbError(error);
  const counts = {};
  for (const row of data) counts[row.estado] = (counts[row.estado] || 0) + 1;
  return Object.entries(counts).map(([estado, cantidad]) => ({ estado, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
}

async function getTrend(tiendaFilter, selectedYear) {
  const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const months = [];
  const year = Number(selectedYear);
  for (let month = 0; month < 12; month += 1) {
    const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
    months.push({ label: monthLabels[month], start, end });
  }
  return Promise.all(months.map(async ({ label, start, end }) => {
    let request = supabase.from("asistencias").select("estado").gte("fecha", start).lte("fecha", end);
    request = applyStoreScope(request, tiendaFilter);
    const { data } = await request;
    const total = data?.length || 0;
    const presentes = data?.filter((row) => presenteEstados.has(row.estado)).length || 0;
    return { mes: label, tasa: total ? Math.round((presentes / total) * 100) : 0 };
  }));
}

async function getWorkload(tiendaFilter, monthStart, today) {
  let request = supabase.from("asistencias").select("usuario_id,tienda_id,estado").gte("fecha", monthStart).lte("fecha", today);
  request = applyStoreScope(request, tiendaFilter);
  const { data, error } = await request;
  if (error) throw dbError(error);
  const groupKey = Array.isArray(tiendaFilter) || !hasStoreScope(tiendaFilter) ? "tienda_id" : "usuario_id";
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
  if (groupKey === "usuario_id") {
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
  progresoQuery = applyStoreScope(progresoQuery, tiendaFilter);
  const { data: progreso, error: pError } = await progresoQuery;
  if (pError) throw dbError(pError);

  let trabajadoresQuery = supabase.from("usuarios").select("id", { count: "exact", head: true })
    .eq("estado", "activo").in("rol", storeStaffRoles);
  trabajadoresQuery = applyStoreScope(trabajadoresQuery, tiendaFilter);
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
  const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  let request = supabase.from("usuarios").select("fecha_ingreso,fecha_salida,tienda_id").in("rol", storeStaffRoles);
  request = applyStoreScope(request, tiendaFilter);
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
    months.push({ mes: monthLabels[month], anio: year, ingreso, salida, personal_inicio: personalInicio, personal_fin: personalFin });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

async function getErrorsByResponsible(tiendaFilter, desde, hasta) {
  let request = supabase.from("errores_personal")
    .select("id,fecha,categoria,descripcion,accion_correctiva,usuario_id,tienda_id,usuarios!errores_personal_usuario_id_fkey(nombres,apellidos,usuario),tiendas(nombre)")
    .gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false });
  request = applyStoreScope(request, tiendaFilter);
  const { data, error } = await request;
  if (error) throw dbError(error);
  const groups = new Map();
  for (const row of data || []) {
    const personName = `${row.usuarios?.nombres || ""} ${row.usuarios?.apellidos || ""}`.trim();
    const name = personName || row.usuarios?.usuario || row.categoria || "Sin identificar";
    const group = groups.get(name) || { name, value: 0, areas: new Set(), rows: [] };
    group.value += 1;
    if (row.categoria) group.areas.add(row.categoria);
    group.rows.push({
      id: row.id, fecha: row.fecha, categoria: row.categoria || "Sin categoría",
      descripcion: row.descripcion || "", accion_correctiva: row.accion_correctiva || "",
      tienda: row.tiendas?.nombre || "Tienda sin identificar",
    });
    groups.set(name, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, area: [...group.areas].join(", ") || "Sin área", areas: undefined }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

async function getDashboard(user, event) {
  const query = event.queryStringParameters || {};
  const today = todayISO();
  const defaultStart = `${today.slice(0, 4)}-01-01`;
  const desde = isISODate(query.desde) ? query.desde : defaultStart;
  const hasta = isISODate(query.hasta) ? query.hasta : today;
  const rotationYear = /^\d{4}$/.test(String(query.rotation_year || "")) ? String(query.rotation_year) : today.slice(0, 4);
  const rotationDesde = `${rotationYear}-01-01`;
  const rotationHasta = `${rotationYear}-12-31`;
  let tiendaFilter = oversightRoles.has(user.rol) ? Number(query.tienda_id) || null : user.tienda_id;
  if (user.rol === "jefe_zonal") {
    const assignedStoreIds = await zonalStoreIds(user.id);
    const requestedStoreId = Number(query.tienda_id) || null;
    if (requestedStoreId && !assignedStoreIds.includes(requestedStoreId)) throw httpError("La tienda no pertenece a tu clúster.", 403);
    tiendaFilter = requestedStoreId || assignedStoreIds;
  }
  const [summary, states, trend, workload, progresoCursos, rotation, errorsByResponsible] = await Promise.all([
    getSummary(tiendaFilter, hasta, desde),
    getStates(tiendaFilter, desde, hasta),
    getTrend(tiendaFilter, rotationYear),
    getWorkload(tiendaFilter, desde, hasta),
    getCourseProgress(tiendaFilter),
    getRotation(tiendaFilter, rotationDesde, rotationHasta),
    getErrorsByResponsible(tiendaFilter, desde, hasta),
  ]);
  return { summary, states, trend, workload, progresoCursos, rotation, errorsByResponsible, filters: { desde, hasta, rotation_year: rotationYear, tienda_id: tiendaFilter } };
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
  const safeFilename = String(filename).replace(/[^a-zA-Z0-9._-]/g, "-");
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
    body: Buffer.from(buffer).toString("base64"),
    isBase64Encoded: true,
  };
}

async function exportStoreUsersExcel(actor, templateOnly = false) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Usuarios");
  sheet.columns = [
    { header: "Nombres", key: "nombres", width: 22 },
    { header: "Apellidos", key: "apellidos", width: 22 },
    { header: "DNI", key: "dni", width: 12 },
    { header: "Usuario", key: "usuario", width: 18 },
    { header: "Contraseña", key: "password", width: 18 },
    { header: "Teléfono", key: "telefono", width: 14 },
    { header: "Fecha ingreso", key: "fecha_ingreso", width: 16 },
  ];
  sheet.getCell("E1").note = "Opcional para empleados. Si agregas una contraseña, debe tener como mínimo 6 caracteres.";
  for (let rowNumber = 2; rowNumber <= 501; rowNumber += 1) {
    sheet.getCell(`E${rowNumber}`).dataValidation = {
      type: "custom",
      formulae: [`OR(E${rowNumber}="",LEN(E${rowNumber})>=6)`],
      allowBlank: true,
      showInputMessage: true,
      promptTitle: "Contraseña opcional",
      prompt: "Déjala vacía o escribe una contraseña de mínimo 6 caracteres.",
      showErrorMessage: true,
      errorTitle: "Contraseña no válida",
      error: "La contraseña debe estar vacía o tener al menos 6 caracteres.",
    };
  }
  if (templateOnly) {
    const instructions = workbook.addWorksheet("Instrucciones");
    instructions.columns = [{ header: "Cómo completar la plantilla", key: "texto", width: 90 }];
    instructions.addRows([
      { texto: "Completa una persona por fila en la hoja Usuarios. No cambies los nombres de las columnas." },
      { texto: "DNI: exactamente 8 dígitos. Teléfono: 9 dígitos (opcional)." },
      { texto: "Usuario: mínimo 3 caracteres; usa letras, números, punto, guion o guion bajo." },
      { texto: "Contraseña: opcional. Si se completa, debe tener mínimo 6 caracteres. Fecha ingreso: formato AAAA-MM-DD." },
      { texto: "La tienda, el rol Empleado y el estado Activo se asignan automáticamente." },
    ]);
    styleHeader(instructions);
  } else {
    const { data, error } = await supabase.from("usuarios")
      .select("nombres,apellidos,dni,usuario,telefono,fecha_ingreso")
      .eq("tienda_id", actor.tienda_id).in("rol", ["jefe_seguridad", "seguridad", "vendedor", "asistente", "trabajador"]).order("nombres");
    if (error) throw dbError(error);
    sheet.addRows(data.map((row) => ({ ...row, password: "" })));
  }
  styleHeader(sheet);
  sheet.getColumn("dni").numFmt = "@";
  sheet.getColumn("telefono").numFmt = "@";
  return excelResponse(workbook, templateOnly ? "plantilla-usuarios.xlsx" : "usuarios-mi-tienda.xlsx");
}

async function exportTiendaExcel(event, id) {
  const query = event.queryStringParameters || {};
  const tipo = query.tipo === "capacitaciones" ? "capacitaciones" : "asistencias";
  const { data: tienda } = await supabase.from("tiendas").select("nombre").eq("id", id).maybeSingle();
  if (!tienda) throw httpError("Tienda no encontrada.", 404);
  const workbook = new ExcelJS.Workbook();
  if (tipo === "capacitaciones") {
    addCapacitacionesSheet(workbook, "Capacitaciones", await fetchCapacitacionesExport(id, query.desde, query.hasta));
  } else {
    addAsistenciasSheet(workbook, "Asistencias", await fetchAsistenciasExport(id, query.desde, query.hasta));
  }
  return excelResponse(workbook, `${excelSheetName(tienda.nombre)}-${tipo}.xlsx`);
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
  if (!tiendas.length) {
    if (tipo === "capacitaciones") addCapacitacionesSheet(workbook, "Capacitaciones", []);
    else addAsistenciasSheet(workbook, "Asistencias", []);
  }
  for (const tienda of tiendas) {
    const rows = tipo === "capacitaciones"
      ? await fetchCapacitacionesExport(tienda.id, query.desde, query.hasta)
      : await fetchAsistenciasExport(tienda.id, query.desde, query.hasta);
    if (tipo === "capacitaciones") addCapacitacionesSheet(workbook, tienda.nombre, rows);
    else addAsistenciasSheet(workbook, tienda.nombre, rows);
  }
  return excelResponse(workbook, `todas-las-tiendas-${tipo}.xlsx`);
}

// ---------- Gestión operativa por tienda ----------

async function resolveOperationalStoreScope(user, requestedId) {
  const storeId = Number(requestedId || user.tienda_id);
  if (!storeId) throw httpError("Selecciona una tienda.", 400);
  if (user.tienda_id && Number(user.tienda_id) !== storeId) throw httpError("Solo puedes acceder a tu tienda asignada.", 403);
  if (user.rol === "jefe_zonal") {
    const ids = await zonalStoreIds(user.id);
    if (!ids.includes(storeId)) throw httpError("La tienda no está asignada a tu zona.", 403);
  }
  return storeId;
}

function operationalStoreId(event, user) {
  return resolveOperationalStoreScope(user, event.queryStringParameters?.tienda_id || bodyOf(event).tienda_id);
}

async function listOperational(table, event, user, select = "*") {
  const storeId = await operationalStoreId(event, user);
  let request = supabase.from(table).select(select).eq("tienda_id", storeId);
  if (user.rol === "jefe_zonal" && ["amonestaciones", "errores_personal"].includes(table)) {
    const { data: chief } = await supabase.from("usuarios").select("id").eq("tienda_id", storeId).eq("rol", "jefe_tienda").maybeSingle();
    request = request.eq("usuario_id", chief?.id || 0);
  }
  if (event.queryStringParameters?.desde) request = request.gte("fecha", event.queryStringParameters.desde);
  if (event.queryStringParameters?.hasta) request = request.lte("fecha", event.queryStringParameters.hasta);
  const { data, error } = await request.order(table === "documentos_tienda" ? "fecha_vencimiento" : "fecha", { ascending: false });
  if (error) throw dbError(error);
  return data;
}

async function saveTraffic(event, user) {
  const data = bodyOf(event);
  requireFields(data, ["fecha", "rango_hora", "cantidad"]);
  if (!rangosTrafico.has(data.rango_hora)) throw httpError("Selecciona un rango horario válido.", 400);
  if (!isISODate(data.fecha) || !Number.isInteger(Number(data.cantidad)) || Number(data.cantidad) < 0) throw httpError("Indica una fecha y cantidad válidas.", 400);
  const tiendaId = await resolveOperationalStoreScope(user, data.tienda_id);
  const hora = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(new Date());
  const { data: row, error } = await supabase.from("trafico_tienda").upsert({
    tienda_id: tiendaId, fecha: data.fecha, hora, rango_hora: data.rango_hora,
    cantidad: Number(data.cantidad), observaciones: cleanText(data.observaciones) || null,
    registrado_por: user.id, updated_at: limaTimestamp(),
  }, { onConflict: "tienda_id,fecha,rango_hora" }).select().single();
  if (error) throw dbError(error);
  return row;
}

function limaTimestamp(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

async function incidentRecipients(storeId) {
  const recipients = new Set(String(process.env.GERENCIA_GENERAL_EMAIL || "").split(",").map((v) => v.trim()).filter(Boolean));
  const { data: central } = await supabase.from("usuarios").select("email").in("rol", ["gerencia_general", "gerente_comercial"]).eq("estado", "activo").not("email", "is", null);
  for (const row of central || []) if (row.email) recipients.add(row.email);
  const { data: store } = await supabase.from("tiendas").select("cluster:clusters(jefe_zonal_id)").eq("id", storeId).maybeSingle();
  const ids = store?.cluster?.jefe_zonal_id ? [store.cluster.jefe_zonal_id] : [];
  if (ids.length) {
    const { data: zonales } = await supabase.from("usuarios").select("email").in("id", ids).not("email", "is", null);
    for (const row of zonales || []) if (row.email) recipients.add(row.email);
  }
  return [...recipients];
}

async function notifyIncident(incident, storeName) {
  const recipients = await incidentRecipients(incident.tienda_id);
  if (!process.env.RESEND_API_KEY || !process.env.INCIDENCIAS_FROM_EMAIL || !recipients.length) {
    return { estado: "pendiente", detalle: "Configura RESEND_API_KEY, INCIDENCIAS_FROM_EMAIL y correos de destinatarios." };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.INCIDENCIAS_FROM_EMAIL, to: recipients,
      subject: `[${incident.gravedad.toUpperCase()}] Incidencia en ${storeName}`,
      text: `${incident.asunto}\n\n${incident.descripcion}\n\nRegistrada: ${incident.fecha}`,
    }),
  });
  if (!response.ok) return { estado: "error", detalle: `El proveedor de correo respondió ${response.status}.` };
  return { estado: "enviada", detalle: `Enviada a ${recipients.length} destinatario(s).` };
}

async function createIncident(event, user) {
  const data = bodyOf(event);
  requireFields(data, ["descripcion", "gravedad", "tipo"]);
  if (["seguridad", "jefe_seguridad"].includes(user.rol) && !["robo", "robo_frustrado"].includes(data.tipo)) {
    throw httpError("El tipo de incidencia debe ser robo o robo frustrado.", 400);
  }
  if (!["piso_venta", "textil", "calzado", "caja", "almacen", "ingreso", "exterior", "otro"].includes(data.area || "otro")) {
    throw httpError("Selecciona un área o ubicación válida.", 400);
  }
  const storeId = await resolveOperationalStoreScope(user, data.tienda_id);
  const { data: incident, error } = await supabase.from("incidencias").insert({
    tienda_id: storeId, asunto: data.tipo === "robo_frustrado" ? "Robo frustrado" : "Robo", tipo: data.tipo, area: data.area || "otro",
    descripcion: cleanText(data.descripcion), gravedad: data.gravedad, estado: "abierta",
    intervencion: Boolean(data.intervencion), detencion: Boolean(data.detencion),
    fecha: data.fecha || new Date().toISOString(), registrado_por: user.id,
  }).select().single();
  if (error) throw dbError(error);
  try {
    for (const item of Array.isArray(data.productos) ? data.productos : []) {
      const marcaNombre = cleanText(item.marca);
      const producto = cleanText(item.producto);
      if (!marcaNombre || !producto || !Number.isInteger(Number(item.cantidad)) || Number(item.cantidad) < 1 || item.valor === "" || !Number.isFinite(Number(item.valor)) || Number(item.valor) < 0) {
        throw httpError("Revisa los datos de los productos involucrados.", 400);
      }
      const brandLookup = await supabase.from("marcas").select("id,nombre");
      if (brandLookup.error) throw dbError(brandLookup.error);
      let marca = (brandLookup.data || []).find((item) => item.nombre.trim().toLocaleLowerCase("es") === marcaNombre.toLocaleLowerCase("es"));
      if (!marca) {
        const created = await supabase.from("marcas").insert({ nombre: marcaNombre }).select("id").single();
        if (created.error) {
          const existing = await supabase.from("marcas").select("id,nombre");
          marca = (existing.data || []).find((item) => item.nombre.trim().toLocaleLowerCase("es") === marcaNombre.toLocaleLowerCase("es"));
          if (existing.error || !marca) throw dbError(created.error);
        } else marca = created.data;
      }
      const inserted = await supabase.from("incidencia_productos").insert({
        incidencia_id: incident.id, marca_id: marca.id,
        producto, cantidad: Number(item.cantidad), valor: Number(item.valor || 0), recuperado: Boolean(item.recuperado),
      });
      if (inserted.error) throw dbError(inserted.error);
    }
    const personas = (Array.isArray(data.personas) ? data.personas : []).filter((item) => cleanText(item.nombre));
    if (personas.length) {
      const inserted = await supabase.from("incidencia_personas").insert(personas.map((item) => ({
        incidencia_id: incident.id, nombre: cleanText(item.nombre), rol: cleanText(item.rol) || "Testigo",
        documento: cleanText(item.documento) || null, observacion: cleanText(item.observacion) || null,
      })));
      if (inserted.error) throw dbError(inserted.error);
    }
  } catch (detailError) {
    await supabase.from("incidencias").delete().eq("id", incident.id);
    throw detailError;
  }
  const { data: store } = await supabase.from("tiendas").select("nombre").eq("id", storeId).single();
  const notification = await notifyIncident(incident, store?.nombre || `Tienda ${storeId}`).catch((err) => ({ estado: "error", detalle: err.message }));
  await supabase.from("incidencias").update({ notificacion_estado: notification.estado, notificacion_detalle: notification.detalle }).eq("id", incident.id);
  return { ...incident, notificacion_estado: notification.estado, notificacion_detalle: notification.detalle };
}

async function listBrands() {
  const { data, error } = await supabase.from("marcas").select("id,nombre").order("nombre");
  if (error) throw dbError(error);
  return data;
}

async function exportIncidentsExcel(event, user) {
  const rows = await listOperational("incidencias", event, user,
    "*,tiendas(nombre),usuarios!incidencias_registrado_por_fkey(nombres,apellidos,usuario),incidencia_productos(id,producto,cantidad,valor,recuperado,marcas(id,nombre)),incidencia_personas(id,nombre,rol,documento,observacion)");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Asiste";
  workbook.created = new Date();

  const incidents = workbook.addWorksheet("Incidencias");
  incidents.columns = [
    { header: "Código", key: "codigo", width: 14 }, { header: "Tienda", key: "tienda", width: 24 },
    { header: "Fecha", key: "fecha", width: 14 }, { header: "Hora", key: "hora", width: 10 },
    { header: "Tipo", key: "tipo", width: 18 },
    { header: "Área / ubicación", key: "area", width: 20 }, { header: "Severidad", key: "gravedad", width: 14 },
    { header: "Estado", key: "estado", width: 15 }, { header: "Descripción", key: "descripcion", width: 55 },
    { header: "Intervención", key: "intervencion", width: 14 }, { header: "Detención", key: "detencion", width: 12 },
    { header: "Registrado por", key: "registrado_por", width: 28 }, { header: "Cantidad de productos", key: "productos", width: 20 },
    { header: "Valor involucrado", key: "valor", width: 19 }, { header: "Valor recuperado", key: "recuperado", width: 18 },
    { header: "Personas involucradas", key: "personas", width: 20 },
  ];
  incidents.addRows(rows.map((row) => ({
    codigo: incidentCode(row), tienda: row.tiendas?.nombre || "", fecha: formatLimaDate(row.fecha), hora: formatLimaTime(row.fecha), tipo: humanize(row.tipo), area: humanize(row.area),
    gravedad: humanize(row.gravedad), estado: humanize(row.estado || "abierta"), descripcion: row.descripcion,
    intervencion: row.intervencion ? "Sí" : "No", detencion: row.detencion ? "Sí" : "No",
    registrado_por: row.usuarios ? `${row.usuarios.nombres} ${row.usuarios.apellidos} (@${row.usuarios.usuario})` : row.registrado_por,
    productos: row.incidencia_productos?.length || 0,
    valor: (row.incidencia_productos || []).reduce((sum, item) => sum + Number(item.valor) * Number(item.cantidad), 0),
    recuperado: (row.incidencia_productos || []).filter((item) => item.recuperado).reduce((sum, item) => sum + Number(item.valor) * Number(item.cantidad), 0),
    personas: row.incidencia_personas?.length || 0,
  })));
  incidents.getColumn("valor").numFmt = '"S/ "#,##0.00';
  incidents.getColumn("recuperado").numFmt = '"S/ "#,##0.00';
  incidents.getColumn("descripcion").alignment = { vertical: "top", wrapText: true };
  styleHeader(incidents);

  const products = workbook.addWorksheet("Productos");
  products.columns = [
    { header: "Código de incidencia", key: "codigo", width: 20 }, { header: "Tienda", key: "tienda", width: 24 },
    { header: "Producto", key: "producto", width: 30 }, { header: "Marca", key: "marca", width: 24 },
    { header: "Cantidad", key: "cantidad", width: 12 }, { header: "Valor unitario", key: "valor", width: 18 },
    { header: "Valor total", key: "total", width: 18 }, { header: "Recuperado", key: "recuperado", width: 14 },
  ];
  for (const row of rows) for (const item of row.incidencia_productos || []) products.addRow({
    codigo: incidentCode(row), tienda: row.tiendas?.nombre || "", producto: item.producto, marca: item.marcas?.nombre || "",
    cantidad: item.cantidad, valor: Number(item.valor), total: Number(item.valor) * Number(item.cantidad), recuperado: item.recuperado ? "Sí" : "No",
  });
  products.getColumn("valor").numFmt = '"S/ "#,##0.00'; products.getColumn("total").numFmt = '"S/ "#,##0.00'; styleHeader(products);

  const people = workbook.addWorksheet("Personas involucradas");
  people.columns = [
    { header: "Código de incidencia", key: "codigo", width: 20 }, { header: "Tienda", key: "tienda", width: 24 },
    { header: "Nombre", key: "nombre", width: 30 }, { header: "Rol", key: "rol", width: 20 },
    { header: "Documento", key: "documento", width: 18 }, { header: "Observación", key: "observacion", width: 45 },
  ];
  for (const row of rows) for (const person of row.incidencia_personas || []) people.addRow({
    codigo: incidentCode(row), tienda: row.tiendas?.nombre || "", nombre: person.nombre, rol: person.rol,
    documento: person.documento || "", observacion: person.observacion || "",
  });
  people.getColumn("observacion").alignment = { vertical: "top", wrapText: true }; styleHeader(people);
  const nowParts = limaDateParts(new Date());
  return excelResponse(workbook, `${nowParts.month}-${nowParts.day}-incidentes.xlsx`);
}

function incidentCode(row) { return row.codigo || `INC-${String(row.id).padStart(4, "0")}`; }
function humanize(value) { return value ? String(value).replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase()) : ""; }
function formatLimaDate(value) { return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)); }
function formatLimaTime(value) { return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)); }
function limaDateParts(value) { const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", month: "2-digit", day: "2-digit" }).formatToParts(value); return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); }

async function ensureWorkerInStore(userId, storeId) {
  const { data } = await supabase.from("usuarios").select("id,tienda_id,rol").eq("id", userId).maybeSingle();
  if (!data || Number(data.tienda_id) !== Number(storeId) || !["trabajador", "vendedor", "asistente", "seguridad", "jefe_seguridad", "asistente_tienda"].includes(data.rol)) {
    throw httpError("La persona no pertenece a la tienda seleccionada.", 400);
  }
}

async function ensureDisciplinaryTarget(actor, userId, storeId) {
  const { data } = await supabase.from("usuarios").select("id,tienda_id,rol").eq("id", userId).maybeSingle();
  if (actor.rol === "jefe_zonal") {
    const ids = await zonalStoreIds(actor.id);
    if (!data || data.rol !== "jefe_tienda" || !ids.includes(Number(storeId)) || Number(data.tienda_id) !== Number(storeId)) {
      throw httpError("El administrador no pertenece a tu clúster.", 403);
    }
    return;
  }
  await ensureWorkerInStore(userId, storeId);
}

async function createDisciplinary(event, user, table) {
  const data = bodyOf(event);
  const isWarning = table === "amonestaciones";
  requireFields(data, isWarning ? ["usuario_id", "tipo", "motivo", "fecha"] : ["usuario_id", "categoria", "descripcion", "fecha"]);
  const storeId = await resolveOperationalStoreScope(user, data.tienda_id);
  await ensureDisciplinaryTarget(user, Number(data.usuario_id), storeId);
  const payload = isWarning
    ? { tienda_id: storeId, usuario_id: Number(data.usuario_id), tipo: data.tipo, motivo: cleanText(data.motivo), fecha: data.fecha, registrado_por: user.id }
    : { tienda_id: storeId, usuario_id: Number(data.usuario_id), categoria: cleanText(data.categoria), descripcion: cleanText(data.descripcion), accion_correctiva: cleanText(data.accion_correctiva) || null, fecha: data.fecha, registrado_por: user.id };
  const { data: row, error } = await supabase.from(table).insert(payload).select().single();
  if (error) throw dbError(error);
  return row;
}

async function createStoreDocument(event, user) {
  const data = bodyOf(event);
  requireFields(data, ["nombre", "fecha_vencimiento"]);
  if (!isISODate(data.fecha_vencimiento)) throw httpError("La fecha de vencimiento no es válida.", 400);
  const storeId = await resolveOperationalStoreScope(user, data.tienda_id);
  const { data: row, error } = await supabase.from("documentos_tienda").insert({
    tienda_id: storeId, nombre: cleanText(data.nombre), numero: cleanText(data.numero) || null,
    entidad_emisora: cleanText(data.entidad_emisora) || null, fecha_emision: data.fecha_emision || null,
    fecha_vencimiento: data.fecha_vencimiento, notas: cleanText(data.notas) || null, registrado_por: user.id,
  }).select().single();
  if (error) throw dbError(error);
  return row;
}

async function operationalSummary(event, user) {
  const storeId = await operationalStoreId(event, user);
  const today = todayISO();
  const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const [traffic, incidents, warnings, errors, documents] = await Promise.all([
    supabase.from("trafico_tienda").select("cantidad").eq("tienda_id", storeId).eq("fecha", today),
    supabase.from("incidencias").select("id", { count: "exact", head: true }).eq("tienda_id", storeId),
    supabase.from("amonestaciones").select("id", { count: "exact", head: true }).eq("tienda_id", storeId),
    supabase.from("errores_personal").select("id", { count: "exact", head: true }).eq("tienda_id", storeId),
    supabase.from("documentos_tienda").select("id", { count: "exact", head: true }).eq("tienda_id", storeId).lte("fecha_vencimiento", in30Days),
  ]);
  return { trafico_hoy: (traffic.data || []).reduce((total, row) => total + Number(row.cantidad || 0), 0), incidencias: incidents.count || 0, amonestaciones: warnings.count || 0, errores: errors.count || 0, documentos_por_vencer: documents.count || 0 };
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
      const user = await withStoreName(ensureAuth(event));
      return json(200, { user });
    }

    const user = ensureAuth(event);

    if (path === "/perfil" && method === "GET") return json(200, await getPerfil(user));
    if (path === "/mis-asistencias" && method === "GET") return json(200, await misAsistencias(event, user));
    if (path === "/mis-capacitaciones" && method === "GET") return json(200, await misCapacitaciones(user));

    if (path === "/dashboard" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await getDashboard(user, event));
    }

    if (path === "/usuarios" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await listUsers(user));
    }
    if (path === "/usuarios" && method === "POST") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(201, await createUser(event, user));
    }
    if (path === "/usuarios/import" && method === "POST") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await importUsersAdmin(event, user));
    }
    if (path === "/usuarios/importar" && method === "POST") {
      ensureAuth(event, ["jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(201, await importStoreUsers(event, user));
    }
    if (path === "/usuarios/export.xlsx" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return oversightRoles.has(user.rol)
        ? await exportUsersExcelAdmin(user, event.queryStringParameters?.plantilla === "1")
        : await exportStoreUsersExcel(user, event.queryStringParameters?.plantilla === "1");
    }
    const userMatch = path.match(/^\/usuarios\/(\d+)$/);
    if (userMatch && method === "PUT") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      await updateUser(event, Number(userMatch[1]), user);
      return json(200, { ok: true });
    }
    if (userMatch && method === "DELETE") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await deleteUser(Number(userMatch[1]), user));
    }

    if (path === "/clusters" && method === "GET") { ensureAuth(event, ["gerencia_general", "gerente_comercial"]); return json(200, await listClusters()); }
    if (path === "/clusters" && method === "POST") { ensureAuth(event, "gerente_comercial"); return json(201, await createCluster(event)); }
    const clusterMatch = path.match(/^\/clusters\/(\d+)$/);
    if (clusterMatch && method === "PUT") { ensureAuth(event, "gerente_comercial"); await updateCluster(event, Number(clusterMatch[1])); return json(200, { ok: true }); }
    if (clusterMatch && method === "DELETE") { ensureAuth(event, "gerente_comercial"); return json(200, await deleteCluster(Number(clusterMatch[1]))); }

    if (path === "/tiendas" && method === "GET") { ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal"]); return json(200, await listTiendas(user)); }
    const tiendaUsersMatch = path.match(/^\/tiendas\/(\d+)\/usuarios$/);
    if (tiendaUsersMatch && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal"]);
      return json(200, await listUsers(user, Number(tiendaUsersMatch[1])));
    }
    if (path === "/tiendas" && method === "POST") { ensureAuth(event, "gerente_comercial"); return json(201, await createTienda(event)); }
    const tiendaMatch = path.match(/^\/tiendas\/(\d+)$/);
    if (tiendaMatch && method === "PUT") {
      ensureAuth(event, "gerente_comercial");
      await updateTienda(event, Number(tiendaMatch[1]));
      return json(200, { ok: true });
    }

    if (path === "/cursos" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "coach", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await listCursos());
    }
    if (path === "/cursos" && method === "POST") { ensureAuth(event, ["gerencia_general", "gerente_comercial", "coach"]); return json(201, await createCurso(event)); }
    const cursoMatch = path.match(/^\/cursos\/(\d+)$/);
    if (cursoMatch && method === "PUT") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "coach"]);
      await updateCurso(event, Number(cursoMatch[1]));
      return json(200, { ok: true });
    }
    if (cursoMatch && method === "DELETE") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "coach"]);
      return json(200, await deleteCurso(Number(cursoMatch[1])));
    }

    if (path === "/encargados" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "coach", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await listEncargados());
    }
    if (path === "/encargados" && method === "POST") { ensureAuth(event, ["gerencia_general", "gerente_comercial", "coach"]); return json(201, await createEncargado(event)); }
    const encargadoMatch = path.match(/^\/encargados\/(\d+)$/);
    if (encargadoMatch && method === "PUT") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "coach"]);
      await updateEncargado(event, Number(encargadoMatch[1]));
      return json(200, { ok: true });
    }

    if (path === "/asistencias" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await listAsistenciasDia(event, user));
    }
    if (path === "/asistencias/lote" && method === "PUT") {
      ensureAuth(event, ["jefe_tienda", "asistente_tienda"]);
      return json(200, await guardarAsistenciasLote(event, user));
    }
    const asistenciaMatch = path.match(/^\/asistencias\/(\d+)$/);
    if (asistenciaMatch && method === "DELETE") {
      ensureAuth(event, ["jefe_tienda", "asistente_tienda"]);
      await eliminarAsistencia(Number(asistenciaMatch[1]), user);
      return json(200, { ok: true });
    }
    if (path === "/asistencias/historial" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await listAsistenciasHistorial(event, user));
    }
    if (path === "/asistencias/log" && method === "GET") {
      ensureAuth(event, ["jefe_tienda", "asistente_tienda"]);
      return json(200, await listLogAsistencias(event, user));
    }
    if (path === "/asistencias/historial/export.xlsx" && method === "GET") {
      ensureAuth(event, ["jefe_tienda", "asistente_tienda"]);
      return await exportMiHistorialExcel(event, user);
    }

    if (path === "/capacitaciones/trabajadores" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "coach", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await listTrabajadores(event, user));
    }
    const trabajadorMatch = path.match(/^\/capacitaciones\/trabajadores\/(\d+)$/);
    if (trabajadorMatch && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "coach", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await getTrabajadorPerfil(Number(trabajadorMatch[1]), user));
    }
    const progresoMatch = path.match(/^\/capacitaciones\/trabajadores\/(\d+)\/cursos\/(\d+)$/);
    if (progresoMatch && method === "PUT") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "coach", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      await guardarProgreso(event, Number(progresoMatch[1]), Number(progresoMatch[2]), user);
      return json(200, { ok: true });
    }
    if (path === "/capacitaciones/resumen" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "coach", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await getResumenCurso(event, user));
    }
    if (path === "/capacitaciones/asignar" && method === "PUT") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "coach", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await asignarLote(event, user));
    }

    const operationalReaders = ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda", "seguridad"];
    if (path === "/operaciones/resumen" && method === "GET") {
      ensureAuth(event, operationalReaders);
      return json(200, await operationalSummary(event, user));
    }
    if (path === "/trafico" && method === "GET") {
      ensureAuth(event, operationalReaders);
      return json(200, await listOperational("trafico_tienda", event, user));
    }
    if (path === "/trafico" && method === "POST") {
      ensureAuth(event, "seguridad");
      return json(201, await saveTraffic(event, user));
    }
    if (path === "/incidencias" && method === "GET") {
      ensureAuth(event, operationalReaders);
      return json(200, await listOperational("incidencias", event, user,
        "*,tiendas(nombre),usuarios!incidencias_registrado_por_fkey(nombres,apellidos,usuario),incidencia_productos(id,producto,cantidad,valor,recuperado,marcas(id,nombre)),incidencia_personas(id,nombre,rol,documento,observacion)"));
    }
    if (path === "/incidencias" && method === "POST") {
      ensureAuth(event, ["seguridad", "jefe_tienda", "asistente_tienda"]);
      return json(201, await createIncident(event, user));
    }
    if (path === "/incidencias/export.xlsx" && method === "GET") {
      ensureAuth(event, operationalReaders);
      return await exportIncidentsExcel(event, user);
    }
    if (path === "/marcas" && method === "GET") {
      ensureAuth(event, ["seguridad", "jefe_tienda", "asistente_tienda"]);
      return json(200, await listBrands());
    }
    if (path === "/amonestaciones" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda"]);
      return json(200, await listOperational("amonestaciones", event, user, "*,usuarios!amonestaciones_usuario_id_fkey(nombres,apellidos)"));
    }
    if (path === "/amonestaciones" && method === "POST") {
      ensureAuth(event, ["jefe_zonal", "jefe_tienda"]);
      return json(201, await createDisciplinary(event, user, "amonestaciones"));
    }
    if (path === "/errores-personal" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await listOperational("errores_personal", event, user, "*,usuarios!errores_personal_usuario_id_fkey(nombres,apellidos)"));
    }
    if (path === "/errores-personal" && method === "POST") {
      ensureAuth(event, ["jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(201, await createDisciplinary(event, user, "errores_personal"));
    }
    if (path === "/documentos-tienda" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda"]);
      return json(200, await listOperational("documentos_tienda", event, user));
    }
    if (path === "/documentos-tienda" && method === "POST") {
      ensureAuth(event, "jefe_tienda");
      return json(201, await createStoreDocument(event, user));
    }

    if (path === "/documentos/todo.xlsx" && method === "GET") {
      ensureAuth(event, "gerencia_general");
      return await exportTodoExcel(event);
    }
    const tiendaExportMatch = path.match(/^\/documentos\/tiendas\/(\d+)\.xlsx$/);
    if (tiendaExportMatch && method === "GET") {
      ensureAuth(event, "gerencia_general");
      return await exportTiendaExcel(event, Number(tiendaExportMatch[1]));
    }

    return json(404, { error: "Ruta no encontrada." });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    return json(status, { error: error.message || "Ocurrió un error inesperado." });
  }
}
