import { ATTENDANCE_OPTIONS, ATTENDANCE_LABELS, PRESENT_STATES } from "../../shared/attendance.js";
import { readRows } from "../lib/read-rows.js";
import { createReportQueries } from "../lib/report-queries.js";
import { retrySupabaseRead } from "../lib/retry-supabase-fetch.js";
import { fetchFacebookInsights } from "../lib/facebook-insights.js";
import { businessDate, addDays, attendanceCounts, courseProgress, rotationCounts, employmentPeriods, pendingAttendance } from "../../shared/metrics.js";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import { mailConfigured } from "../lib/attendance-mail.js";
import { validateSchedule, zonalReportStores, sendScheduledReport } from "../lib/attendance-reports.js";
import { parse as parseCookie, serialize as serializeCookie } from "cookie";
import { allowedAnnualStores, commercialAccess, validCommercialPartPath } from "../lib/commercial-access.js";
import { commercialAssistantMessages } from "../lib/commercial-assistant.js";
import { createProductCodeLookup } from "../lib/commercial-product-codes.js";
import { commercialStockInsights } from "../lib/commercial-stock-insights.js";
import { createAuthenticationDomain } from "../domains/authentication.js";
import { createMarketingDomain } from "../domains/marketing.js";
import { createStoresDomain } from "../domains/stores.js";
import { createReportsDomain } from "../domains/reports.js";
import { createPersonnelDomain } from "../domains/personnel.js";
import { createCommercialDomain } from "../domains/commercial.js";
import { createSecurityDomain } from "../domains/security.js";
import { createOperationsDomain } from "../domains/operations.js";
import { createIntakeDomain } from "../domains/intake.js";
import { createExcelDomain } from "../domains/excel.js";
import { createDashboardDomain } from "../domains/dashboard.js";
import { createWorkforceDomain } from "../domains/workforce.js";
import { createMyStoreDomain } from "../domains/my-store.js";
import { createZonalDomain } from "../domains/zonal.js";
import { hashOperationalPassword, verifyOperationalPassword } from "../lib/operational-passwords.js";
import { aggregateCommercialGoalTotals, normalizeGoalRubro } from "../lib/commercial-goals.js";
import { buildStoreSalesForecast } from "../lib/store-sales-forecast.js";
import { normalizeLaborArea } from "../../src/lib/laborAreas.js";
import { normalizeDepartureReason, validDepartureReason } from "../../src/lib/personnelCatalogs.js";
import { normalizedPersonnelFields } from "../../shared/personnelNormalization.js";
import { isSecurityIncident } from "../../shared/securityIncidents.js";
import { randomUUID } from "node:crypto";
import { resolveAdministratorContext, storeSupportCatalog, saveStoreSupport } from "../lib/store-support.js";
import { SYSTEM_UPLOAD_CHUNK_SIZE, SYSTEM_SOURCES, validateSystemUpload, systemPartPath, systemManifestPath } from "../../shared/systemUpload.js";
import { COMMERCIAL_BATCH_MAX_BYTES, COMMERCIAL_BATCH_SOURCES, commercialBatchPath, commercialBatchSources, validateBatchId, validateCutoff } from "../../shared/commercialBatch.js";
import { NORMALIZED_REPORTS, normalizedReportPath } from "../../shared/normalizedReports.js";
import { ANNUAL_REPORT_KINDS, ANNUAL_DETAIL_COLUMNS, annualReportPath, annualSummaryPath, annualMonthlyReportPath, annualMonthlySummaryPath, parseAnnualFilters, csvLine } from "../../shared/annualReports.js";
import { summarizeAnnualReports, buildAnnualSummaryWorkbook } from "../lib/annual-report-workbook.js";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { gunzipSync } from "node:zlib";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: retrySupabaseRead },
});
const commercialProductCodes = createProductCodeLookup(supabase);
let excelModulePromise;

async function createExcelWorkbook() {
  excelModulePromise ||= import("exceljs");
  const { default: ExcelJS } = await excelModulePromise;
  return new ExcelJS.Workbook();
}

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const userRoles = new Set(["gerencia_general", "gerente_comercial", "administrador_seguridad", "sistemas", "marketing", "coach", "jefe_zonal", "jefe_tienda", "asistente_tienda", "jefe_seguridad", "jefe_area", "seguridad", "caja", "almacenero", "vendedor", "asistente", "trabajador"]);
const centralRoles = new Set(["gerencia_general", "gerente_comercial", "administrador_seguridad", "sistemas", "marketing", "coach", "jefe_zonal"]);
const storeManagementRoles = new Set(["jefe_tienda", "asistente_tienda"]);
const oversightRoles = new Set(["gerencia_general", "gerente_comercial", "marketing", "coach", "jefe_zonal"]);
const storeStaffRoles = ["jefe_tienda", "asistente_tienda", "jefe_seguridad", "jefe_area", "seguridad", "caja", "almacenero", "vendedor", "asistente", "trabajador"];
const attendanceStaffRoles = storeStaffRoles.filter(role => !["seguridad", "jefe_seguridad"].includes(role));
const userStates = new Set(["activo", "inactivo"]);
const tiendaEstados = new Set(["activo", "inactivo"]);
const asistenciaEstados = new Set(ATTENDANCE_OPTIONS.map(option => option.value));
const estadoLabels = ATTENDANCE_LABELS;
const presenteEstados = PRESENT_STATES;
const operacionesLog = new Set(["creacion", "edicion", "eliminacion"]);
const progresoLabels = { pendiente: "Pendiente", en_curso: "En curso", completado: "Completado" };
const progresoEstados = new Set(["pendiente", "en_curso", "completado"]);
const disabledPassword = "!SIN_ACCESO!";
const rangosTrafico = new Set([
  "09:00-10:00", "10:00-11:00", "11:00-12:00", "12:00-13:00", "13:00-14:00",
  "14:00-15:00", "15:00-16:00", "16:00-17:00", "17:00-18:00", "18:00-19:00",
  "19:00-20:00", "20:00-21:00", "21:00-22:00", "22:00-23:00",
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
  return businessDate();
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
    const missing = String(error.message || "").match(/(?:table|column) ['"]?public\.([a-z0-9_]+)/i)?.[1];
    return httpError(missing
      ? `Falta habilitar "${missing}" en la base de datos. Ejecuta su migración y recarga el esquema de Supabase.`
      : "La estructura de la base de datos no está actualizada. Ejecuta las migraciones pendientes.", 500);
  }
  console.error(error);
  return httpError("Ocurrió un error al acceder a la base de datos.", 500);
}

const { readAllResult, fetchAllReportPages } = createReportQueries({ readRows, dbError });

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
  const user = event.authUser || currentUser(event);
  if (!user) throw httpError("Tu sesión expiró. Inicia sesión nuevamente.", 401);
  if (roles) {
    const allowed = Array.isArray(roles) ? roles : [roles];
    const equivalentRole = user.rol === "jefe_seguridad" ? "seguridad" : ["vendedor", "asistente", "caja", "almacenero", "jefe_area"].includes(user.rol) ? "trabajador" : user.rol;
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

function sessionClaims(user) {
  return {
    id: user.id, nombres: user.nombres, apellidos: user.apellidos, dni: user.dni || null, usuario: user.usuario,
    rol: user.rol, tienda_id: user.tienda_principal_id ?? user.tienda_id,
    cambio_credenciales_pendiente: Boolean(user.cambio_credenciales_pendiente),
    credenciales_actualizadas_en: user.credenciales_actualizadas_en || null,
    ...(user.rol === "jefe_tienda" ? { tienda_contexto_id: user.tienda_contexto_id ?? user.tienda_id } : {}),
    ...(user.apoyo_temporal ? { apoyo_temporal: true } : {}),
  };
}

async function authenticatedContext(event, allowFallback = false) {
  const session = ensureAuth(event);
  if (session.rol === "jefe_tienda" || session.tienda_contexto_id) {
    if (!allowFallback && session.tienda_contexto_id && !event.headers["x-store-context"]) {
      throw Object.assign(httpError("Actualiza esta ventana para continuar con la tienda activa.", 409), { code: "STORE_CONTEXT_CHANGED" });
    }
    return resolveAdministratorContext(supabase, session, { allowFallback, expectedStore: allowFallback ? null : event.headers["x-store-context"] });
  }
  if (session.rol === "jefe_zonal") {
    const { data: account, error } = await supabase.from("usuarios").select("id,nombres,apellidos,usuario,rol,estado,tienda_id").eq("id", session.id).maybeSingle();
    if (error) throw dbError(error);
    if (!account || account.estado !== "activo" || account.rol !== "jefe_zonal") throw httpError("Tu autorización ha cambiado. Inicia sesión nuevamente.", 401);
    return { ...session, ...account };
  }
  return session;
}

const { currentCommercialAccess, commercialOperationalSummary, commercialStoreGoals, listCommercialGoals, saveCommercialGoals, publishedCommercialRelease, commercialManifest, commercialFileSource, commercialCompanyRanking, commercialStoreTransfers } = createCommercialDomain({
  supabase, commercialAccess, dbError, httpError, readAllResult, fetchAllReportPages, normalizeGoalRubro, aggregateCommercialGoalTotals, bodyOf, cleanText, validCommercialPartPath, gunzipSync,
});

// ---------- Validación ----------

function cleanUsuario(value) {
  return cleanText(value).toLowerCase();
}

function validateUserPayload(data) {
  requireFields(data, ["nombres", "apellidos", "dni", "rol", "estado", "fecha_ingreso"]);
  if (cleanText(data.nombres).length < 2 || cleanText(data.apellidos).length < 2) {
    throw httpError("Los nombres y apellidos deben ser válidos.", 400);
  }
  const tipoDocumento = data.tipo_documento || "dni";
  if (!["dni", "ce"].includes(tipoDocumento)) throw httpError("Selecciona un tipo de documento válido.", 400);
  const documentLength = tipoDocumento === "dni" ? 8 : 9;
  if (!new RegExp(`^\\d{${documentLength}}$`).test(cleanText(data.dni))) {
    throw httpError(`El ${tipoDocumento.toUpperCase()} debe tener ${documentLength} dígitos.`, 400);
  }
  const usuario = cleanUsuario(data.usuario) || null;
  if (usuario && (usuario.length < 2 || !/^[a-z0-9._-]+$/.test(usuario))) {
    throw httpError("El usuario debe tener al menos 2 caracteres (letras, números, punto, guion).", 400);
  }
  if (data.telefono && !/^\d{9}$/.test(cleanText(data.telefono))) {
    throw httpError("El teléfono debe tener 9 dígitos.", 400);
  }
  if (data.mes_cumpleanos && !/^(0[1-9]|1[0-2])$/.test(String(data.mes_cumpleanos))) throw httpError("Selecciona un mes de cumpleaños válido.", 400);
  if (!userRoles.has(data.rol)) throw httpError("El rol no es válido.", 400);
  if (!userStates.has(data.estado)) throw httpError("El estado no es válido.", 400);
  if (!isISODate(data.fecha_ingreso) || (data.fecha_salida && !isISODate(data.fecha_salida))) {
    throw httpError("Las fechas de ingreso y salida deben ser vÃ¡lidas.", 400);
  }
  if (data.fecha_salida && data.fecha_salida < data.fecha_ingreso) {
    throw httpError("La fecha de salida no puede ser anterior a la fecha de ingreso.", 400);
  }
  if (data.estado === "inactivo" && !data.fecha_salida) throw httpError("Indica la fecha de salida.", 400);
  if (data.fecha_salida && !validDepartureReason(data.motivo_salida)) throw httpError("Selecciona un motivo de salida válido.", 400);
  if (data.regimen_jornada != null && data.regimen_jornada !== "") {
    const hours = Number(String(data.regimen_jornada).replace(/h$/, ""));
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24 || Math.round(hours * 100) / 100 !== hours) throw httpError("La jornada debe ser mayor que 0 y hasta 24 horas, con máximo dos decimales.", 400);
    data.regimen_jornada = `${hours}h`;
  }
  if (data.tipo_turno && !["apertura", "intermedio", "cierre", "part_time"].includes(data.tipo_turno)) throw httpError("El tipo de turno no es válido.", 400);
  if (data.tiene_parentesco && (!cleanText(data.tipo_parentesco) || !cleanText(data.familiar_vinculo))) {
    throw httpError("Indica el tipo de parentesco y el nombre del familiar o vínculo.", 400);
  }
  if (centralRoles.has(data.rol) && data.tienda_id) {
    throw httpError("Gerentes y jefes zonales no llevan una única tienda asignada.", 400);
  }
  if (!centralRoles.has(data.rol) && data.rol !== "jefe_tienda" && !data.tienda_id) {
    throw httpError("Selecciona la tienda del usuario.", 400);
  }
  if (data.password && String(data.password).length < 3) {
    throw httpError("La contraseña debe tener al menos 3 caracteres.", 400);
  }
  if (!isISODate(data.fecha_ingreso)) throw httpError("La fecha de ingreso no es válida.", 400);
  if (data.fecha_salida && (!isISODate(data.fecha_salida) || data.fecha_salida < data.fecha_ingreso)) {
    throw httpError("La fecha de salida debe ser válida y posterior a la fecha de ingreso.", 400);
  }
}

function validateTiendaPayload(data) {
  requireFields(data, ["nombre", "codigo", "direccion", "distrito", "provincia", "departamento", "formato", "fecha_apertura", "estado"]);
  const nombre = cleanText(data.nombre);
  const codigo = cleanText(data.codigo).toUpperCase();
  if (nombre.length < 2 || nombre.length > 120) throw httpError("El nombre de la tienda debe tener entre 2 y 120 caracteres.", 400);
  if (!/^[A-Z0-9-]{2,20}$/.test(codigo)) throw httpError("El código debe tener entre 2 y 20 caracteres y usar solo letras, números o guiones.", 400);
  const direccion = cleanText(data.direccion);
  if (direccion.length < 3 || direccion.length > 180) throw httpError("La dirección debe tener entre 3 y 180 caracteres.", 400);
  for (const field of ["distrito", "provincia", "departamento"]) {
    const value = cleanText(data[field]);
    if (value.length < 2 || value.length > 80) throw httpError("Selecciona un departamento, provincia y distrito válidos.", 400);
  }
  if (!["PROPIA", "METRO"].includes(cleanText(data.formato).toUpperCase())) throw httpError("Selecciona un formato válido: Propia o Metro.", 400);
  if (!tiendaEstados.has(data.estado)) throw httpError("El estado no es válido.", 400);
  for (const field of ["fecha_apertura", "fecha_cierre"]) {
    if (data[field] && !isISODate(data[field])) throw httpError("Las fechas de la tienda no son válidas.", 400);
  }
  if (data.fecha_apertura && data.fecha_cierre && data.fecha_cierre < data.fecha_apertura) {
    throw httpError("La fecha de cierre no puede ser anterior a la fecha de apertura.", 400);
  }
  if (data.estado === "inactivo" && !data.fecha_cierre) throw httpError("Indica la fecha de cierre de la tienda inactiva.", 400);
  for (const field of ["metraje_m2", "capacidad_stock_unid", "capacidad_stock_calzado_unid", "capacidad_stock_textil_unid", "cant_colaboradores_normal", "colaboradores_camp", "alquiler_mensual"]) {
    if (data[field] !== "" && data[field] != null && (!Number.isFinite(Number(data[field])) || Number(data[field]) < 0)) {
      throw httpError("Los valores operativos de la tienda deben ser números positivos.", 400);
    }
  }
  for (const field of ["capacidad_stock_unid", "capacidad_stock_calzado_unid", "capacidad_stock_textil_unid", "cant_colaboradores_normal", "colaboradores_camp"]) {
    if (data[field] !== "" && data[field] != null && !Number.isInteger(Number(data[field]))) {
      throw httpError("El stock y la cantidad de colaboradores deben ser números enteros.", 400);
    }
  }
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

const { excelSheetName, styleHeader, excelResponse, exportStoreUsersExcel, exportTiendaExcel, exportMiHistorialExcel, exportTodoExcel } = createExcelDomain({
  createExcelWorkbook, dbError, estadoLabels, fetchAllReportPages,
  httpError, isISODate, progresoLabels, readAllResult, supabase,
});

const { systemUploadStart, systemUploadComplete, systemUploadCancel, systemUploadsList, commercialBatchStart, commercialBatchComplete, commercialBatchCancel, commercialBatchesList, normalizedReportCatalog, normalizedReportLink, annualReportCatalog, annualReportDimensions, annualDetailLinks, annualLocalDetailFile, annualSummaryExcel, commercialAssistantChat, commercialAssistantTranscribe } = createIntakeDomain({
  allowedAnnualStores, ANNUAL_DETAIL_COLUMNS, ANNUAL_REPORT_KINDS,
  annualMonthlyReportPath, annualMonthlySummaryPath, annualReportPath,
  annualSummaryPath, bodyOf, buildAnnualSummaryWorkbook,
  COMMERCIAL_BATCH_MAX_BYTES, COMMERCIAL_BATCH_SOURCES,
  commercialAssistantMessages, commercialBatchPath, commercialBatchSources,
  currentCommercialAccess, dbError, excelResponse, gunzipSync, httpError,
  join, jwt, jwtSecret, NORMALIZED_REPORTS, normalizedReportPath,
  parseAnnualFilters, publishedCommercialRelease, randomUUID, readFile,
  resolve, summarizeAnnualReports, supabase, SYSTEM_SOURCES,
  SYSTEM_UPLOAD_CHUNK_SIZE, systemManifestPath, systemPartPath,
  validateBatchId, validateCutoff, validateSystemUpload,
});

// ---------- Autenticación ----------
const { authAccount, login, credentialPermissions, setCredentialPermission, changeCredentials, loginApoyoSeguridad } = createAuthenticationDomain({
  supabase, bodyOf, requireFields, cleanUsuario, dbError, json, disabledPassword, verifyOperationalPassword, hashOperationalPassword, resolveAdministratorContext, withStoreName, jwt, sessionClaims, jwtSecret, sessionCookie, readAllResult, httpError, todayISO, cleanText,
});

// ---------- Usuarios ----------
const { zonalStoreIds, resolveStoreScope, activeStoreIds, listUsers, ensureUniqueUser, createUser, importStoreUsers, updateUser, deleteUser, importUsersAdmin, exportUsersExcelAdmin } = createPersonnelDomain({
  supabase, readAllResult, fetchAllReportPages, dbError, httpError, cleanText, cleanUsuario, bodyOf, hashOperationalPassword, validateUserPayload, storeManagementRoles, centralRoles, normalizeLaborArea, normalizeDepartureReason, normalizedPersonnelFields, createExcelWorkbook, styleHeader, excelResponse,
});

async function communicationStoreScope(user, requestedStoreId = null) {
  let storeId = Number(requestedStoreId) || null;
  if (user.rol === "jefe_tienda") {
    const { data: account, error: accountError } = await supabase.from("usuarios")
      .select("id,rol,estado,tienda_id").eq("id", user.id).maybeSingle();
    if (accountError) throw dbError(accountError);
    if (!account || account.rol !== "jefe_tienda" || account.estado !== "activo" || !account.tienda_id) {
      throw httpError("Tu cuenta ya no tiene acceso de administrador de tienda.", 403);
    }
    storeId = Number(account.tienda_id);
  } else if (user.rol === "jefe_zonal") {
    const storeIds = await zonalStoreIds(user.id);
    if (!storeId) return { storeIds };
    if (!storeIds.some(id => Number(id) === storeId)) throw httpError("La tienda no pertenece a tu zona.", 403);
  } else {
    throw httpError("La bandeja está disponible para los roles zonal y administrador de tienda.", 403);
  }

  const { data: store, error: storeError } = await supabase.from("tiendas")
    .select("id,nombre,estado,jefe_id,cluster:clusters(jefe_zonal_id)").eq("id", storeId).maybeSingle();
  if (storeError) throw dbError(storeError);
  if (!store || store.estado !== "activo") throw httpError("La tienda no está activa.", 404);
  const zonalId = Number(store.cluster?.jefe_zonal_id) || null;
  if (!zonalId) throw httpError("La tienda todavía no tiene un jefe zonal asignado.", 409);

  let managerId = Number(store.jefe_id) || null;
  if (managerId) {
    const { data: manager, error } = await supabase.from("usuarios").select("id")
      .eq("id", managerId).eq("rol", "jefe_tienda").eq("estado", "activo").eq("tienda_id", storeId).maybeSingle();
    if (error) throw dbError(error);
    if (!manager) managerId = null;
  }
  if (!managerId) {
    const { data: manager, error } = await supabase.from("usuarios").select("id")
      .eq("rol", "jefe_tienda").eq("estado", "activo").eq("tienda_id", storeId).maybeSingle();
    if (error) throw dbError(error);
    managerId = Number(manager?.id) || null;
  }
  if (!managerId) throw httpError("La tienda todavía no tiene un administrador activo.", 409);
  if (user.rol === "jefe_tienda" && managerId !== Number(user.id)) {
    throw httpError("Tu cuenta no es el administrador asignado a esta tienda.", 403);
  }
  return { store, storeId, zonalId, managerId };
}

async function getStoreMailbox(event, user) {
  const requestedStoreId = event.queryStringParameters?.tienda_id;
  if (user.rol === "jefe_zonal" && !requestedStoreId) {
    const { storeIds } = await communicationStoreScope(user);
    if (!storeIds.length) return { tiendas: [], tienda_id: null, mensajes: [], documentos: [] };
    const { data, error } = await readAllResult(supabase.from("tiendas")
      .select("id,nombre,estado,jefe_id").in("id", storeIds).eq("estado", "activo").order("nombre"));
    if (error) throw dbError(error);
    return { tiendas: data || [], tienda_id: null, mensajes: [], documentos: [] };
  }

  const scope = await communicationStoreScope(user, requestedStoreId);
  const { data: messages, error: messageError } = await supabase.from("bandeja_mensajes_zonal_tienda")
    .select("id,tienda_id,remitente_id,destinatario_id,mensaje,leido_en,created_at,remitente:usuarios!bandeja_mensajes_zonal_tienda_remitente_id_fkey(nombres,apellidos,rol),destinatario:usuarios!bandeja_mensajes_zonal_tienda_destinatario_id_fkey(nombres,apellidos,rol)")
    .eq("tienda_id", scope.storeId).in("remitente_id", [scope.zonalId, scope.managerId])
    .in("destinatario_id", [scope.zonalId, scope.managerId]).order("created_at", { ascending: false }).limit(100);
  if (messageError) throw dbError(messageError);

  let documents = [];
  if (user.rol === "jefe_tienda") {
    const { data, error } = await supabase.from("documentos_municipales")
      .select("id,tipo_documento,codigo,fecha_vencimiento,dias_alerta,estado")
      .eq("tienda_id", scope.storeId).gte("fecha_vencimiento", todayISO())
      .order("fecha_vencimiento").limit(250);
    if (error) throw dbError(error);
    const today = todayISO();
    documents = (data || []).filter(row => {
      const days = Math.round((Date.parse(`${row.fecha_vencimiento}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
      return days <= Number(row.dias_alerta || 30);
    });
  }
  let stores = [];
  if (user.rol === "jefe_zonal") {
    const storeIds = await zonalStoreIds(user.id);
    const { data, error } = await readAllResult(supabase.from("tiendas")
      .select("id,nombre").in("id", storeIds.length ? storeIds : [0]).eq("estado", "activo").order("nombre"));
    if (error) throw dbError(error);
    stores = data || [];
  }
  return {
    tiendas: stores,
    tienda_id: scope.storeId,
    zonal_id: scope.zonalId,
    mensajes: messages || [],
    documentos: documents,
  };
}

async function sendMailboxMessage(event, user) {
  const body = bodyOf(event);
  const scope = await communicationStoreScope(user, body.tienda_id);
  const message = cleanText(body.mensaje);
  if (!message || message.length > 2000) throw httpError("Escribe un mensaje de hasta 2000 caracteres.", 400);
  const recipientId = Number(user.id) === scope.managerId ? scope.zonalId : scope.managerId;
  const { data, error } = await supabase.from("bandeja_mensajes_zonal_tienda").insert({
    tienda_id: scope.storeId, remitente_id: Number(user.id), destinatario_id: recipientId, mensaje: message,
  }).select("id,tienda_id,remitente_id,destinatario_id,mensaje,leido_en,created_at")
    .single();
  if (error) throw dbError(error);
  return data;
}

async function markMailboxMessageRead(event, user, messageId) {
  const { data: message, error: readError } = await supabase.from("bandeja_mensajes_zonal_tienda")
    .select("id,tienda_id,remitente_id,destinatario_id").eq("id", messageId).maybeSingle();
  if (readError) throw dbError(readError);
  if (!message || Number(message.destinatario_id) !== Number(user.id)) throw httpError("El mensaje no está en tu bandeja recibida.", 404);
  const scope = await communicationStoreScope(user, message.tienda_id);
  if (![scope.zonalId, scope.managerId].includes(Number(message.remitente_id))) throw httpError("No tienes acceso a este mensaje.", 403);
  const { error } = await supabase.from("bandeja_mensajes_zonal_tienda")
    .update({ leido_en: new Date().toISOString() }).eq("id", message.id).is("leido_en", null);
  if (error) throw dbError(error);
  return { ok: true };
}



// ---------- Clústeres y tiendas ----------
const { listClusters, createCluster, updateCluster, deleteCluster, listTiendas, listStoreCatalogs, createTienda, updateTienda } = createStoresDomain({
  supabase, readAllResult, dbError, httpError, validIds, bodyOf, requireFields, cleanText, zonalStoreIds, fetchAllReportPages, validateTiendaPayload,
});

const { hasStoreScope, applyStoreScope, getDashboard } = createDashboardDomain({
  activeStoreIds, attendanceCounts, courseProgress, dbError,
  employmentPeriods, fetchAllReportPages, httpError, isISODate,
  presenteEstados, readAllResult, resolveStoreScope, rotationCounts,
  storeStaffRoles, supabase, todayISO, zonalStoreIds,
});

// ---------- Asistencias ----------

const { listAsistenciasDia, guardarAsistenciasLote, eliminarAsistencia, listAsistenciasHistorial, listLogAsistencias, misAsistencias, listCursos, createCurso, updateCurso, deleteCurso, listEncargados, createEncargado, updateEncargado, listTrabajadores, getTrabajadorPerfil, guardarProgreso, getResumenCurso, asignarLote, misCapacitaciones } = createWorkforceDomain({
  activeStoreIds, applyStoreScope, asistenciaEstados, attendanceStaffRoles,
  bodyOf, cleanText, dbError, estadoLabels, fetchAllReportPages, httpError,
  isISODate, operacionesLog, oversightRoles, progresoEstados, readAllResult,
  requireFields, resolveStoreScope, storeStaffRoles, supabase, todayISO,
  userRoles, validateCursoPayload, validateEncargadoPayload, validIds,
  zonalStoreIds,
});

// ---------- Perfil ----------

async function getPerfil(user) {
  const { data, error } = await supabase.from("usuarios")
    .select("id,nombres,apellidos,dni,usuario,telefono,rol,estado,fecha_creacion,tienda_id,tiendas!usuarios_tienda_id_fkey(nombre,direccion,alquiler_mensual,estado)")
    .eq("id", user.id).single();
  if (error) throw dbError(error);
  if (user.rol === "jefe_tienda" && Number(user.tienda_id) !== Number(data.tienda_id)) {
    const { data: store, error: storeError } = await supabase.from("tiendas").select("nombre,direccion,alquiler_mensual,estado").eq("id", user.tienda_id).maybeSingle();
    if (storeError) throw dbError(storeError);
    data.tienda_principal_id = data.tienda_id;
    data.tienda_id = user.tienda_id;
    data.tiendas = store;
  }
  const monthStart = `${todayISO().slice(0, 7)}-01`;
  const today = todayISO();
  const { data: mes, error: attendanceError } = await readAllResult(supabase.from("asistencias").select("estado")
    .eq("usuario_id", user.id).gte("fecha", monthStart).lte("fecha", today));
  if (attendanceError) throw dbError(attendanceError);
  const total = mes?.length || 0;
  const presentes = mes?.filter((row) => presenteEstados.has(row.estado)).length || 0;
  return {
    ...data, tiendas: undefined, tienda_nombre: data.tiendas?.nombre || null,
    tienda_direccion: data.tiendas?.direccion || null, tienda_alquiler_mensual: data.tiendas?.alquiler_mensual ?? null, tienda_estado: data.tiendas?.estado || null,
    asistencia_mes: total ? Math.round((presentes / total) * 100) : null,
    dias_registrados_mes: total,
  };
}

const { listOperational, listDashboardDocumentAlerts, saveTraffic, updateTraffic, exportTrafficExcel, createIncident, updateIncident, listIncidents, listBrands, listStoreProducts, exportIncidentsExcel, incidentCode, humanize, formatLimaDate, createDisciplinary, warningEvidence, createStoreDocument, listSpecialCoverages, listCoverageCandidates, saveSpecialCoverage, executiveAlerts, dashboardPeople, operationalSummary, storeSalesForecast, listTrafficMatrix, securityAdminReport } = createOperationsDomain({
  httpError, zonalStoreIds, bodyOf, supabase, isISODate, fetchAllReportPages,
  dbError, requireFields, rangosTrafico, cleanText, createExcelWorkbook,
  styleHeader, excelResponse, isSecurityIncident, createSecurityDomain,
  todayISO, csvLine, businessDate, readAllResult, storeStaffRoles, validIds,
  normalizeLaborArea, activeStoreIds, resolveStoreScope, applyStoreScope,
  commercialCompanyRanking, publishedCommercialRelease, commercialStoreGoals,
  addDays, buildStoreSalesForecast, hasStoreScope,
});

// ---------- Supervisión zonal ----------

const { serializeVisit, getZonalModule, createZonalSupervision, getZonalComparison, getGeneralComparison, getZonalCluster, signedZonalSupervisionFile, exportZonalSupervisions, createZonalIncident, updateZonalIncident, exportZonalIncidents } = createZonalDomain({
  attendanceStaffRoles, bodyOf, cleanText, createExcelWorkbook, dbError,
  employmentPeriods, excelResponse, fetchAllReportPages, formatLimaDate,
  httpError, isISODate, isSecurityIncident, listClusters, listTiendas,
  listUsers, pendingAttendance, presenteEstados, readAllResult,
  requireFields, storeStaffRoles, styleHeader, supabase, todayISO,
  zonalStoreIds,
});

// ---------- Reportes e historial ----------
const { getReportRows, exportReportExcel, getMovements, exportMovementsExcel } = createReportsDomain({
  supabase, httpError, hasStoreScope, applyStoreScope, cleanText, businessDate, isISODate, todayISO, resolveStoreScope, dbError, storeStaffRoles, fetchAllReportPages, normalizedPersonnelFields, humanize, normalizeLaborArea, normalizeDepartureReason, incidentCode, excelSheetName, createExcelWorkbook, styleHeader, excelResponse,
});

// ---------- Mi tienda (solo jefe de tienda) ----------

const { getMiTienda, updateMiTiendaData, saveMiTiendaRecord, createSecuritySupport, updateSecuritySupport, addRequirementTracking, updateZonalObservation, validateZonalObservation, uploadMiTiendaFile, signedMiTiendaFile } = createMyStoreDomain({
  bodyOf, cleanText, dbError, disabledPassword, ensureUniqueUser,
  httpError, isISODate, readAllResult, requireFields, serializeVisit,
  supabase, todayISO, zonalStoreIds,
});

// ---------- Marketing ----------
const { getMarketingData, createMarketingRecord, registerApprovedMarketingCampaign, updateMarketingValidation, marketingAttendance, changeMarketingStaff } = createMarketingDomain({
  supabase, dbError, readAllResult, todayISO, storeStaffRoles, bodyOf, requireFields, cleanText, httpError,
});

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
    if (path === "/auth/apoyo-seguridad" && method === "POST") return await loginApoyoSeguridad(event);
    if (path === "/auth/logout" && method === "POST") {
      return json(200, { ok: true }, { "Set-Cookie": clearSessionCookie(event) });
    }
    if (path === "/auth/me" && method === "GET") {
      const session = ensureAuth(event);
      const { data: account, error } = await authAccount(fields => supabase.from("usuarios")
        .select(fields).eq("id", session.id).maybeSingle());
      if (error) throw dbError(error);
      if (!account || account.estado !== "activo") throw httpError("Tu cuenta ya no está activa.", 401);
      if ((session.credenciales_actualizadas_en || null) !== (account.credenciales_actualizadas_en || null))
        throw httpError("Tus credenciales cambiaron. Inicia sesión nuevamente.", 401);
      const sessionUser = {
        id: account.id, nombres: account.nombres, apellidos: account.apellidos, dni: account.dni,
        usuario: account.usuario, rol: account.rol, tienda_id: account.tienda_id,
        cambio_credenciales_pendiente: account.cambio_credenciales_pendiente,
        credenciales_actualizadas_en: account.credenciales_actualizadas_en,
        ...(session.apoyo_temporal ? { apoyo_temporal: true } : {}),
        ...(account.rol === "jefe_tienda" ? { tienda_contexto_id: session.tienda_contexto_id } : {}),
      };
      const user = account.rol === "jefe_tienda"
        ? await resolveAdministratorContext(supabase, sessionUser, { allowFallback: true }) : await withStoreName(sessionUser);
      // Routine refreshes must not overwrite a newer store selection made in another tab.
      const changed = user.apoyo_revocado || JSON.stringify(sessionClaims(user)) !== JSON.stringify(sessionClaims(session));
      const renewed = changed ? { "Set-Cookie": sessionCookie(jwt.sign(sessionClaims(user), jwtSecret(), { expiresIn: "10h" }), event) } : {};
      return json(200, { user }, renewed);
    }

    const user = await authenticatedContext(event, path === "/auth/change-credentials");
    event.authUser = user;
    if (path === "/auth/change-credentials" && method === "POST") return await changeCredentials(event, user);
    if (user.cambio_credenciales_pendiente) throw httpError("Actualiza tu usuario y contraseña para continuar.", 403);

    if (path === "/systems/credential-permissions" && method === "GET") {
      return json(200, await credentialPermissions(user));
    }
    const credentialPermissionMatch = path.match(/^\/systems\/credential-permissions\/(\d+)$/);
    if (credentialPermissionMatch && method === "PATCH") {
      return json(200, await setCredentialPermission(event, user, credentialPermissionMatch[1]));
    }

    if (path === "/auth/tienda" && method === "POST") {
      ensureAuth(event, "jefe_tienda");
      const storeId = Number(bodyOf(event).tienda_id);
      if (!Number.isSafeInteger(storeId) || !(user.tiendas_disponibles || []).some(store => Number(store.id) === storeId)) throw httpError("No tienes acceso habilitado a esa tienda.", 403);
      const selected = await resolveAdministratorContext(supabase, { ...sessionClaims(user), tienda_contexto_id: storeId });
      return json(200, { user: selected }, { "Set-Cookie": sessionCookie(jwt.sign(sessionClaims(selected), jwtSecret(), { expiresIn: "10h" }), event) });
    }
    if (path === "/bandeja-zonal-tienda" && method === "GET") {
      ensureAuth(event, ["jefe_zonal", "jefe_tienda"]);
      return json(200, await getStoreMailbox(event, user));
    }
    if (path === "/bandeja-zonal-tienda/mensajes" && method === "POST") {
      ensureAuth(event, ["jefe_zonal", "jefe_tienda"]);
      return json(201, await sendMailboxMessage(event, user));
    }
    const mailboxReadMatch = path.match(/^\/bandeja-zonal-tienda\/mensajes\/(\d+)\/leido$/);
    if (mailboxReadMatch && method === "PATCH") {
      ensureAuth(event, ["jefe_zonal", "jefe_tienda"]);
      return json(200, await markMailboxMessageRead(event, user, Number(mailboxReadMatch[1])));
    }
    if (path === "/zonal/apoyos-tienda" && method === "GET") {
      return json(200, await storeSupportCatalog(supabase, user, zonalStoreIds));
    }
    if (path === "/zonal/apoyos-tienda" && method === "POST") {
      return json(201, await saveStoreSupport(supabase, user, bodyOf(event), zonalStoreIds));
    }
    const storeSupportMatch = path.match(/^\/zonal\/apoyos-tienda\/(\d+)$/);
    if (storeSupportMatch && method === "PATCH") {
      return json(200, await saveStoreSupport(supabase, user, bodyOf(event), zonalStoreIds, Number(storeSupportMatch[1])));
    }

    if (path === "/systems/uploads" && method === "GET") {
      return json(200, await systemUploadsList(user));
    }
    if (path === "/systems/uploads/start" && method === "POST") {
      return json(200, await systemUploadStart(event, user));
    }
    if (path === "/systems/uploads/complete" && method === "POST") {
      return json(201, await systemUploadComplete(event, user));
    }
    if (path === "/systems/uploads/cancel" && method === "POST") {
      return json(200, await systemUploadCancel(event, user));
    }
    if (path === "/systems/batches" && method === "GET") {
      return json(200, await commercialBatchesList(user));
    }
    if (path === "/systems/batches/start" && method === "POST") {
      return json(200, await commercialBatchStart(event, user));
    }
    if (path === "/systems/batches/complete" && method === "POST") {
      return json(201, await commercialBatchComplete(event, user));
    }
    if (path === "/systems/batches/cancel" && method === "POST") {
      return json(200, await commercialBatchCancel(event, user));
    }

    if (path === "/commercial/access" && method === "GET") {
      return json(200, { access: await currentCommercialAccess(user) });
    }
    if (path === "/commercial-goals" && method === "GET") {
      ensureAuth(event, "gerente_comercial");
      return json(200, await listCommercialGoals(event, user));
    }
    if (path === "/commercial-goals" && method === "PUT") {
      ensureAuth(event, "gerente_comercial");
      return json(200, await saveCommercialGoals(event, user));
    }
    if (path === "/commercial/product-codes" && method === "POST") {
      await currentCommercialAccess(user);
      return json(200, { codes: await commercialProductCodes(bodyOf(event).productIds) });
    }
    if (path === "/seguridad-central" && method === "GET") {
      ensureAuth(event, "administrador_seguridad");
      const result = await securityAdminReport(event);
      return result.statusCode ? result : json(200, result);
    }
    if (path === "/commercial/manifest" && method === "GET") {
      return json(200, await commercialManifest(user));
    }
    if (path === "/commercial/stock-insights" && method === "POST") {
      const access = await currentCommercialAccess(user);
      const release = await publishedCommercialRelease();
      return json(200, await commercialStockInsights(supabase, access, release, bodyOf(event)));
    }
    if (path === "/commercial/normalized-reports" && method === "GET") {
      return json(200, await normalizedReportCatalog(user));
    }
    if (path === "/commercial/normalized-reports/download" && method === "GET") {
      return json(200, await normalizedReportLink(event, user));
    }
    if (path === "/commercial/annual-reports" && method === "GET") {
      return json(200, await annualReportCatalog(user));
    }
    if (path === "/commercial/annual-reports/dimensions" && method === "GET") {
      return json(200, await annualReportDimensions(event, user));
    }
    if (path === "/commercial/operational-summary" && method === "GET") {
      return json(200, await commercialOperationalSummary(user));
    }
    if (path === "/commercial/store-goals" && method === "GET") {
      return json(200, await commercialStoreGoals(user));
    }
    if (path === "/commercial/store-transfers" && method === "GET") {
      return json(200, await commercialStoreTransfers(user));
    }
    if (path === "/commercial/company-ranking" && method === "GET") {
      return json(200, await commercialCompanyRanking(user));
    }
    if (path === "/commercial/annual-reports/links" && method === "GET") {
      return json(200, await annualDetailLinks(event, user));
    }
    if (path === "/commercial/annual-reports/local-file" && method === "GET") {
      return annualLocalDetailFile(event, user);
    }
    if (path === "/commercial/annual-reports/summary.xlsx" && method === "GET") {
      return annualSummaryExcel(event, user);
    }
    const commercialFileMatch = path.match(/^\/commercial\/files\/(dashboard(?:-[a-z0-9-]+)?\.json)$/);
    if (commercialFileMatch && method === "GET") {
      return json(200, await commercialFileSource(user, commercialFileMatch[1]));
    }
    if (path === "/assistant/chat" && method === "POST") {
      return json(200, await commercialAssistantChat(event, user));
    }
    if (path === "/assistant/transcribe" && method === "POST") {
      return json(200, await commercialAssistantTranscribe(event, user));
    }

    if (path === "/marketing" && method === "GET") { ensureAuth(event, "marketing"); return json(200, await getMarketingData(user)); }
    if (path === "/marketing/facebook-insights" && method === "GET") {
      ensureAuth(event, "marketing");
      try {
        return json(200, await fetchFacebookInsights(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));
      } catch (error) {
        console.error("Facebook insights:", error instanceof Error ? error.message : error);
        const message = error instanceof Error && /token de Meta/.test(error.message)
          ? error.message : "No se pudieron cargar los datos de Facebook. Revisa la conexión en Supabase.";
        throw httpError(message, 502);
      }
    }
    if(path === "/marketing/attendance" && method === "GET" || path === "/marketing/attendance/lote" && method === "PUT") { ensureAuth(event,"marketing");return json(200,await marketingAttendance(user,event,method)); }
    const marketingStaffMatch=path.match(/^\/marketing\/staff\/(\d+)$/);
    if(marketingStaffMatch && ["PUT","PATCH","DELETE"].includes(method)){ensureAuth(event,"marketing");return json(200,await changeMarketingStaff(event,user,marketingStaffMatch[1],method));}
    const marketingValidationMatch = path.match(/^\/marketing\/validations\/(\d+)$/);
    if (marketingValidationMatch && method === "PUT") { ensureAuth(event, "marketing"); return json(200, await updateMarketingValidation(event, user, marketingValidationMatch[1])); }
    if (path === "/marketing/campaigns/register" && method === "POST") { ensureAuth(event, "marketing"); return json(200, await registerApprovedMarketingCampaign(event, user)); }
    const marketingMatch = path.match(/^\/marketing\/(staff|attendance|validations|trainings|warnings|errors|campaigns|incidents|deliverables|followers)$/);
    if (marketingMatch && method === "POST") { ensureAuth(event, "marketing"); return json(201, await createMarketingRecord(event, user, marketingMatch[1])); }

    if (path === "/perfil" && method === "GET") return json(200, await getPerfil(user));
    if (path === "/mis-asistencias" && method === "GET") return json(200, await misAsistencias(event, user));
    if (path === "/mis-capacitaciones" && method === "GET") return json(200, await misCapacitaciones(user));

    if (path === "/gerencia/alertas" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial"]);
      return json(200, await executiveAlerts());
    }
    if (path === "/personal/resumen" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await dashboardPeople(event, user));
    }
    if (path === "/dashboard" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await getDashboard(user, event));
    }

    if (path === "/zonal/reportes-asistencia" && method === "GET") {
      ensureAuth(event, ["jefe_zonal", "gerencia_general", "gerente_comercial"]);
      const requestedPage = Number(event.queryStringParameters?.pagina || 1);
      const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;
      const [stores, schedules, history] = await Promise.all([
        zonalReportStores(supabase, user.id),
        supabase.from("programaciones_asistencia_zonal").select("*").eq("usuario_id", user.id).order("created_at"),
        supabase.from("envios_asistencia_zonal").select("*", { count: "exact" }).eq("usuario_id", user.id).order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 20, page * 20 - 1),
      ]);
      if (schedules.error) throw dbError(schedules.error);
      if (history.error) throw dbError(history.error);
      return json(200, { tiendas: stores, programaciones: schedules.data, historial: history.data, total_historial: history.count, pagina: page, remitente: process.env.GMAIL_USER || "thisisalexa363@gmail.com", correo_configurado: mailConfigured() });
    }
    if (path === "/zonal/reportes-asistencia" && method === "POST") {
      ensureAuth(event, ["jefe_zonal", "gerencia_general", "gerente_comercial"]);
      const stores = await zonalReportStores(supabase, user.id);
      let input;
      try { input = validateSchedule(bodyOf(event), stores); } catch (error) { throw httpError(error.message, 400); }
      const { data, error } = await supabase.from("programaciones_asistencia_zonal").insert({ ...input, usuario_id: user.id }).select().single();
      if (error) throw dbError(error);
      return json(201, data);
    }
    const attendanceScheduleMatch = path.match(/^\/zonal\/reportes-asistencia\/(\d+)(\/enviar)?$/);
    if (attendanceScheduleMatch && ["PUT", "DELETE", "POST"].includes(method)) {
      ensureAuth(event, ["jefe_zonal", "gerencia_general", "gerente_comercial"]);
      const scheduleId = Number(attendanceScheduleMatch[1]);
      const { data: schedule, error } = await supabase.from("programaciones_asistencia_zonal").select("*").eq("id", scheduleId).eq("usuario_id", user.id).maybeSingle();
      if (error) throw dbError(error);
      if (!schedule) throw httpError("Programación no encontrada.", 404);
      if (method === "POST" && attendanceScheduleMatch[2]) {
        if (!mailConfigured()) throw httpError("Configura las credenciales de Gmail en el servidor antes de enviar.", 400);
        const date = bodyOf(event).fecha;
        let result;
        try { result = await sendScheduledReport(supabase, schedule, date); } catch (error) { throw httpError(error.message || "No se pudo enviar el reporte.", 400); }
        if (result.estado === "error") throw httpError(result.detalle, 502);
        return json(200, result);
      }
      if (!attendanceScheduleMatch[2] && method === "PUT") {
        let input;
        try { input = validateSchedule(bodyOf(event), await zonalReportStores(supabase, user.id)); } catch (error) { throw httpError(error.message, 400); }
        const { data, error: updateError } = await supabase.from("programaciones_asistencia_zonal").update(input).eq("id", scheduleId).eq("usuario_id", user.id).select().single();
        if (updateError) throw dbError(updateError);
        return json(200, data);
      }
      if (!attendanceScheduleMatch[2] && method === "DELETE") {
        const { error: deleteError } = await supabase.from("programaciones_asistencia_zonal").delete().eq("id", scheduleId).eq("usuario_id", user.id);
        if (deleteError) throw dbError(deleteError);
        return json(200, { eliminado: true });
      }
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
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_tienda", "asistente_tienda"]);
      return json(200, await deleteUser(Number(userMatch[1]), user));
    }

    if (path === "/clusters" && method === "GET") { ensureAuth(event, ["gerencia_general", "gerente_comercial"]); return json(200, await listClusters()); }
    if (path === "/clusters" && method === "POST") { ensureAuth(event, "gerente_comercial"); return json(201, await createCluster(event)); }
    const clusterMatch = path.match(/^\/clusters\/(\d+)$/);
    if (clusterMatch && method === "PUT") { ensureAuth(event, "gerente_comercial"); await updateCluster(event, Number(clusterMatch[1])); return json(200, { ok: true }); }
    if (clusterMatch && method === "DELETE") { ensureAuth(event, "gerente_comercial"); return json(200, await deleteCluster(Number(clusterMatch[1]))); }

    if (path === "/tiendas" && method === "GET") { ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal"]); return json(200, await listTiendas(user)); }
    if (path === "/tiendas/catalogos" && method === "GET") { ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal"]); return json(200, await listStoreCatalogs()); }
    const tiendaUsersMatch = path.match(/^\/tiendas\/(\d+)\/usuarios$/);
    if (tiendaUsersMatch && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal"]);
      return json(200, await listUsers(user, Number(tiendaUsersMatch[1])));
    }
    if (path === "/tiendas" && method === "POST") { ensureAuth(event, ["gerente_comercial", "jefe_zonal"]); return json(201, await createTienda(event, user)); }
    const tiendaMatch = path.match(/^\/tiendas\/(\d+)$/);
    if (tiendaMatch && method === "PUT") {
      ensureAuth(event, ["gerente_comercial", "jefe_zonal"]);
      await updateTienda(event, Number(tiendaMatch[1]), user);
      return json(200, { ok: true });
    }

    if (path === "/cursos" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "coach", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await listCursos(user));
    }
    if (path === "/cursos" && method === "POST") { ensureAuth(event, "coach"); return json(201, await createCurso(event)); }
    const cursoMatch = path.match(/^\/cursos\/(\d+)$/);
    if (cursoMatch && method === "PUT") {
      ensureAuth(event, "coach");
      await updateCurso(event, Number(cursoMatch[1]));
      return json(200, { ok: true });
    }
    if (cursoMatch && method === "DELETE") {
      ensureAuth(event, "coach");
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

    if (path === "/capacitaciones/alcances" && method === "GET") {
      ensureAuth(event, "coach");
      const [stores, clusters] = await Promise.all([
        readAllResult(supabase.from("tiendas").select("id,nombre,estado,cluster_id").order("nombre").order("id")),
        readAllResult(supabase.from("clusters").select("id,nombre,codigo,jefe_zonal_id").order("id")),
      ]);
      if (stores.error) throw dbError(stores.error);
      if (clusters.error) throw dbError(clusters.error);
      return json(200, { tiendas: stores.data, clusters: clusters.data });
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
      ensureAuth(event, ["coach", "jefe_tienda", "asistente_tienda"]);
      await guardarProgreso(event, Number(progresoMatch[1]), Number(progresoMatch[2]), user);
      return json(200, { ok: true });
    }
    if (path === "/capacitaciones/resumen" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "coach", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await getResumenCurso(event, user));
    }
    if (path === "/capacitaciones/asignar" && method === "PUT") {
      ensureAuth(event, ["coach", "jefe_tienda", "asistente_tienda"]);
      return json(200, await asignarLote(event, user));
    }

    if (path === "/zonal/comparativa" && method === "GET") {
      ensureAuth(event, "jefe_zonal");
      return json(200, await getZonalComparison(event, user));
    }
    if (path === "/gerencia/comparativa" && method === "GET") {
      ensureAuth(event, "gerencia_general");
      return json(200, await getGeneralComparison(event, user));
    }
    const zonalModuleMatch = path.match(/^\/zonal\/(personal|asistencia|tareas|supervisiones|incidencias)$/);
    if (zonalModuleMatch && method === "GET") {
      ensureAuth(event, ["gerencia_general", "jefe_zonal"]);
      return json(200, await getZonalModule(event, user, zonalModuleMatch[1]));
    }
    if (path === "/zonal/tareas" && method === "POST") {
      ensureAuth(event, "jefe_zonal"); throw httpError("El rol zonal consulta tareas, pero no puede crearlas.", 403);
    }
    const zonalAdministratorMatch = path.match(/^\/zonal\/administradores\/(\d+)$/);
    if (zonalAdministratorMatch && method === "PUT") {
      ensureAuth(event, "jefe_zonal");
      throw httpError("El rol zonal consulta administradores, pero no puede modificarlos.", 403);
    }
    const zonalTaskMatch = path.match(/^\/zonal\/tareas\/(\d+)$/);
    if (zonalTaskMatch && method === "PUT") {
      ensureAuth(event, "jefe_zonal"); throw httpError("El rol zonal consulta tareas, pero no puede modificarlas.", 403);
    }
    if (path === "/zonal/supervisiones" && method === "POST") {
      ensureAuth(event, "jefe_zonal"); return json(201, await createZonalSupervision(event, user));
    }
    if (path === "/zonal/cluster" && method === "GET") {
      ensureAuth(event, "jefe_zonal"); return json(200, await getZonalCluster(user));
    }
    if (path === "/zonal/supervisiones/export.xlsx" && method === "GET") {
      ensureAuth(event, "jefe_zonal"); return await exportZonalSupervisions(user);
    }
    if (path === "/zonal/supervisiones/archivo-url" && method === "POST") {
      ensureAuth(event, "jefe_zonal"); return json(200, await signedZonalSupervisionFile(event,user));
    }
    const zonalObservationValidationMatch=path.match(/^\/zonal\/observaciones\/(\d+)\/validar$/);
    if(zonalObservationValidationMatch&&method==="PUT"){
      ensureAuth(event,"jefe_zonal");return json(200,await validateZonalObservation(event,user,Number(zonalObservationValidationMatch[1])));
    }
    if (path === "/zonal/incidencias" && method === "POST") {
      ensureAuth(event, "jefe_zonal"); return json(201, await createZonalIncident(event, user));
    }
    if (path === "/zonal/incidencias/export.xlsx" && method === "GET") {
      ensureAuth(event, "jefe_zonal"); return await exportZonalIncidents(user);
    }
    const zonalIncidentMatch = path.match(/^\/zonal\/incidencias\/(\d+)$/);
    if (zonalIncidentMatch && method === "PUT") {
      ensureAuth(event, "jefe_zonal"); return json(200, await updateZonalIncident(event, user, Number(zonalIncidentMatch[1])));
    }

    const reportExportMatch = path.match(/^\/reportes\/([a-z-]+)\/export\.xlsx$/);
    if (reportExportMatch && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda"]);
      return await exportReportExcel(event, user, reportExportMatch[1]);
    }
    const reportMatch = path.match(/^\/reportes\/([a-z-]+)$/);
    if (reportMatch && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda"]);
      return json(200, { rows: await getReportRows(event, user, reportMatch[1]) });
    }
    if (path === "/movimientos/export.xlsx" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda"]);
      return await exportMovementsExcel(event, user);
    }
    if (path === "/movimientos" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda"]);
      return json(200, { rows: await getMovements(event, user) });
    }

    const operationalReaders = ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda", "seguridad"];
    if (path === "/operaciones/resumen" && method === "GET") {
      ensureAuth(event, operationalReaders);
      return json(200, await operationalSummary(event, user));
    }
    if (path === "/operaciones/pronostico-ventas" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await storeSalesForecast(event, user));
    }
    if (path === "/trafico/matriz" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await listTrafficMatrix(event, user));
    }
    if (path === "/trafico" && method === "GET") {
      ensureAuth(event, operationalReaders);
      return json(200, await listOperational("trafico_tienda", event, user));
    }
    if (path === "/trafico/export.xlsx" && method === "GET") {
      ensureAuth(event, operationalReaders);
      return await exportTrafficExcel(event, user);
    }
    if (path === "/trafico" && method === "POST") {
      ensureAuth(event, "seguridad");
      return json(201, await saveTraffic(event, user));
    }
    const trafficMatch = path.match(/^\/trafico\/(\d+)$/);
    if (trafficMatch && method === "PUT") {
      ensureAuth(event, "seguridad");
      return json(200, await updateTraffic(event, user, Number(trafficMatch[1])));
    }
    if (path === "/incidencias" && method === "GET") {
      ensureAuth(event, operationalReaders.filter(role => role !== "jefe_tienda"));
      return json(200, await listIncidents(event, user));
    }
    if (path === "/incidencias" && method === "POST") {
      ensureAuth(event, ["seguridad", "asistente_tienda"]);
      return json(201, await createIncident(event, user));
    }
    const incidentMatch = path.match(/^\/incidencias\/(\d+)$/);
    if (incidentMatch && method === "PUT") {
      ensureAuth(event, "seguridad");
      return json(200, await updateIncident(event, user, Number(incidentMatch[1])));
    }
    if (path === "/incidencias/export.xlsx" && method === "GET") {
      ensureAuth(event, operationalReaders.filter(role => role !== "jefe_tienda"));
      return await exportIncidentsExcel(event, user);
    }
    if (path === "/marcas" && method === "GET") {
      ensureAuth(event, ["seguridad", "jefe_tienda", "asistente_tienda"]);
      return json(200, await listBrands());
    }
    if (path === "/productos/catalogo" && method === "GET") {
      ensureAuth(event, "seguridad");
      return json(200, await listStoreProducts(event, user));
    }
    if (path === "/amonestaciones" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda"]);
      return json(200, await listOperational("amonestaciones", event, user, "*,usuarios!amonestaciones_usuario_id_fkey(nombres,apellidos)"));
    }
    if (path === "/amonestaciones" && method === "POST") {
      ensureAuth(event, "jefe_tienda");
      return json(201, await createDisciplinary(event, user, "amonestaciones"));
    }
    const warningEvidenceMatch = path.match(/^\/amonestaciones\/(\d+)\/evidencia$/);
    if (warningEvidenceMatch && method === "GET") {
      ensureAuth(event, "jefe_tienda");
      return json(200, await warningEvidence(Number(warningEvidenceMatch[1]), user));
    }
    if (path === "/errores-personal" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await listOperational("errores_personal", event, user, "*,usuarios!errores_personal_usuario_id_fkey(nombres,apellidos)"));
    }
    if (path === "/errores-personal" && method === "POST") {
      ensureAuth(event, ["jefe_tienda", "asistente_tienda"]);
      return json(201, await createDisciplinary(event, user, "errores_personal"));
    }
    if (path === "/documentos-tienda" && method === "GET") {
      ensureAuth(event, ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda"]);
      return json(200, await listOperational("documentos_tienda", event, user));
    }
    if (path === "/documentos-alertas" && method === "GET") {
      ensureAuth(event, ["jefe_zonal", "jefe_tienda", "asistente_tienda"]);
      return json(200, await listDashboardDocumentAlerts(event, user));
    }
    if (path === "/documentos-tienda" && method === "POST") {
      ensureAuth(event, "jefe_tienda");
      return json(201, await createStoreDocument(event, user));
    }
    if (path === "/coberturas-especiales" && method === "GET") {
      ensureAuth(event, ["jefe_tienda", "asistente_tienda"]);
      return json(200, await listSpecialCoverages(user));
    }
    if (path === "/coberturas-personal" && method === "GET") {
      ensureAuth(event, ["jefe_tienda", "asistente_tienda"]);
      return json(200, await listCoverageCandidates(user));
    }
    if (path === "/coberturas-especiales" && method === "POST") {
      ensureAuth(event, ["jefe_tienda", "asistente_tienda"]);
      return json(201, await saveSpecialCoverage(event, user));
    }

    if (path === "/mi-tienda-gestion" && method === "GET") {
      ensureAuth(event, "jefe_tienda");
      return json(200, await getMiTienda(user));
    }
    if (path === "/mi-tienda-gestion/datos" && method === "PUT") {
      ensureAuth(event, "jefe_tienda"); await updateMiTiendaData(event, user); return json(200, { ok: true });
    }
    if (path === "/mi-tienda-gestion/archivo" && method === "POST") {
      ensureAuth(event, "jefe_tienda"); return json(201, await uploadMiTiendaFile(event, user));
    }
    if (path === "/mi-tienda-gestion/archivo-url" && method === "POST") {
      ensureAuth(event, "jefe_tienda"); return json(200, await signedMiTiendaFile(event, user));
    }
    if (path === "/mi-tienda-gestion/apoyos-seguridad" && method === "POST") {
      ensureAuth(event, "jefe_tienda"); return json(201, await createSecuritySupport(event, user));
    }
    const securitySupportMatch = path.match(/^\/mi-tienda-gestion\/apoyos-seguridad\/(\d+)$/);
    if (securitySupportMatch && method === "PUT") {
      ensureAuth(event, "jefe_tienda"); return json(200, await updateSecuritySupport(event, user, Number(securitySupportMatch[1])));
    }
    const miTiendaRecordMatch = path.match(/^\/mi-tienda-gestion\/(documentos|reclamaciones|acciones|requerimientos)(?:\/(\d+))?$/);
    if (miTiendaRecordMatch && ["POST", "PUT"].includes(method)) {
      ensureAuth(event, "jefe_tienda");
      if (method === "PUT" && !miTiendaRecordMatch[2]) throw httpError("Falta indicar el registro.", 400);
      return json(method === "POST" ? 201 : 200, await saveMiTiendaRecord(event, user, miTiendaRecordMatch[1], miTiendaRecordMatch[2] ? Number(miTiendaRecordMatch[2]) : null));
    }
    const requirementTrackingMatch = path.match(/^\/mi-tienda-gestion\/requerimientos\/(\d+)\/seguimiento$/);
    if (requirementTrackingMatch && method === "POST") {
      ensureAuth(event, "jefe_tienda"); return json(201, await addRequirementTracking(event, user, Number(requirementTrackingMatch[1])));
    }
    const zonalObservationMatch = path.match(/^\/mi-tienda-gestion\/observaciones\/(\d+)$/);
    if (zonalObservationMatch && method === "PUT") {
      ensureAuth(event, "jefe_tienda"); return json(200, await updateZonalObservation(event, user, Number(zonalObservationMatch[1])));
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
    return json(status, { error: error.message || "Ocurrió un error inesperado.", ...(error.code ? { code: error.code } : {}) });
  }
}
