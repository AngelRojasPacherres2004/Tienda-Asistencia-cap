import ExcelJS from "exceljs";
import { loadEnv } from "vite";
import path from "node:path";
import process from "node:process";

const projectDir = process.cwd();
const sourcePath = path.resolve(projectDir, process.argv.find((arg) => arg.endsWith(".xlsx")) || "1. CRONOGRAMA AREA COMERCIAL.xlsx");
const apply = process.argv.includes("--apply");
const env = loadEnv("development", projectDir, "");
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env.");

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/gi, " ").trim().replace(/\s+/g, " ").toUpperCase();
const text = (cell) => {
  const raw = cell.value;
  if (raw == null || raw?.type === "Merge") return "";
  return String(raw?.result ?? raw).replace(/\s+/g, " ").trim();
};
const excelDate = (value) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 20000) return null;
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
};
const splitName = (fullName) => {
  const tokens = fullName.trim().split(/\s+/);
  if (tokens.length === 1) return { nombres: tokens[0], apellidos: "Sin apellido registrado" };
  if (tokens.length === 2) return { nombres: tokens[0], apellidos: tokens[1] };
  if (tokens.length === 3) return { nombres: tokens[0], apellidos: tokens.slice(1).join(" ") };
  return { nombres: tokens.slice(0, 2).join(" "), apellidos: tokens.slice(2).join(" ") };
};
const classifyRole = (value) => {
  const role = normalize(value);
  if (/ASIS.*ADMIN/.test(role)) return "asistente_tienda";
  if (/CAJER/.test(role)) return "caja";
  if (/^(JF|J)\s*SEGUR|JEFE.*SEGUR/.test(role)) return "jefe_seguridad";
  if (/^SEGURIDAD/.test(role)) return "seguridad";
  if (/ALMACEN/.test(role)) return "almacenero";
  if (/^J\s*A\b/.test(role)) return "jefe_area";
  if (/VEND|HOGAR|HOG\s+TEC/.test(role)) return "vendedor";
  return "trabajador";
};
const areaFor = (sourceRole, role) => {
  const value = normalize(sourceRole);
  if (role === "jefe_tienda" || role === "asistente_tienda") return "Administración";
  if (role === "caja") return "Caja";
  if (["jefe_seguridad", "seguridad"].includes(role)) return "Seguridad";
  if (role === "almacenero") return "Almacén";
  if (/TEXT/.test(value)) return "Textil";
  if (/CALZ/.test(value)) return "Calzado";
  if (/ELEC/.test(value)) return "Electro";
  if (/HOG/.test(value)) return "Hogar";
  if (/TEC/.test(value)) return "Tecnología";
  return null;
};

async function request(resource, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${resource}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${resource}: ${body}`);
  return body ? JSON.parse(body) : null;
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(sourcePath);

const directorySheet = workbook.getWorksheet("List TDAS DENNIS");
const directoryByName = new Map();
for (let rowNumber = 4; rowNumber <= directorySheet.rowCount; rowNumber += 1) {
  const row = directorySheet.getRow(rowNumber);
  const name = text(row.getCell(4));
  if (!name) continue;
  const rawDocument = text(row.getCell(5));
  let document = rawDocument.replace(/\D/g, "");
  let documentType = /CE/i.test(rawDocument) ? "ce" : "dni";
  if (documentType === "dni" && document.length && document.length < 8) document = document.padStart(8, "0");
  if (!((documentType === "dni" && document.length === 8) || (documentType === "ce" && document.length === 9))) { document = null; documentType = "dni"; }
  const phoneDigits = text(row.getCell(18)).replace(/\D/g, "");
  const person = { row: rowNumber, store: text(row.getCell(3)), name, document, documentType, phone: phoneDigits.length === 9 ? phoneDigits : null, startDate: excelDate(row.getCell(15).value) };
  const rows = directoryByName.get(normalize(name)) || [];
  rows.push(person);
  directoryByName.set(normalize(name), rows);
}

const sourceStores = [
  { column: "B", name: "LA MARINA", aliases: ["MARINA", "LA MARINA"] },
  { column: "E", name: "EMANCIPACIÓN", aliases: ["EMANCIPACION"] },
  { column: "H", name: "INDEPENDENCIA", aliases: ["INDEPENDENCIA"] },
  { column: "L", name: "ANGAMOS", aliases: ["ANGAMOS"] },
  { column: "O", name: "AYACUCHO", aliases: ["AYACUCHO"] },
  { column: "R", name: "PUENTE PIEDRA", aliases: ["PTE PIEDRA", "PUENTE PIEDRA"] },
  { column: "U", name: "TUMBES", aliases: ["TUMBES"] },
  { column: "X", name: "TRUJILLO", aliases: ["TRUJILLO"] },
  { column: "AA", name: "CAJAMARCA", aliases: ["CAJAMARCA"] },
  { column: "AD", name: "ARAMBURÚ", aliases: ["ARAMBURU"] },
  { column: "AG", name: "ALFONSO UGARTE", aliases: ["ALF UGARTE", "ALFONSO UGARTE"] },
  { column: "AJ", name: "PERSHING", aliases: ["PERSHING"] },
  { column: "AM", name: "CALLAO", aliases: ["CALLAO"] },
  { column: "AP", name: "ALIPIO", aliases: ["ALIPIO"] },
  { column: "AT", name: "CHORRILLOS", aliases: ["CHORRILLOS"] },
  { column: "AW", name: "PLAZA UNIÓN", aliases: ["PZA UNION", "PLAZA UNION"] },
  { column: "AZ", name: "COLONIAL", aliases: ["COLONIAL"] },
  { column: "BB", name: "ARGENTINA", aliases: ["ARGENTINA"] },
  { column: "BE", name: "PUNO", aliases: ["PUNO"] },
  { column: "BH", name: "JR. DE LA UNIÓN 797", aliases: ["JR UNION", "JR DE UNION 797", "JIRON DE LA UNION 797"] },
];

const org = workbook.getWorksheet("2. ORGANIGRAMA");
const personnel = [];
for (const [storeIndex, store] of sourceStores.entries()) {
  const adminCell = org.getCell(`${store.column}19`);
  const adminName = text(adminCell);
  const adminFill = String(adminCell.fill?.fgColor?.argb || "").toUpperCase();
  if (adminName && adminFill === "FFFFC000") personnel.push({ store: store.name, storeIndex: storeIndex + 1, name: adminName, sourceRole: "ADMINISTRADOR (NARANJA)", role: "jefe_tienda", sourceCell: `${store.column}19` });
  for (let roleRow = 21; roleRow <= 66; roleRow += 3) {
    const sourceRole = text(org.getCell(`${store.column}${roleRow}`));
    const name = text(org.getCell(`${store.column}${roleRow + 1}`));
    if (!sourceRole || !name) continue;
    personnel.push({ store: store.name, storeIndex: storeIndex + 1, name, sourceRole, role: classifyRole(sourceRole), sourceCell: `${store.column}${roleRow + 1}` });
  }
}

const sourceNameCounts = new Map();
for (const person of personnel) sourceNameCounts.set(normalize(person.name), (sourceNameCounts.get(normalize(person.name)) || 0) + 1);
const directoryDocumentCounts = new Map();
for (const rows of directoryByName.values()) for (const row of rows) if (row.document) directoryDocumentCounts.set(row.document, (directoryDocumentCounts.get(row.document) || 0) + 1);
for (const person of personnel) {
  const matches = directoryByName.get(normalize(person.name)) || [];
  const preferred = matches.length === 1 ? matches[0] : null;
  const safeDocument = preferred?.document && directoryDocumentCounts.get(preferred.document) === 1 && sourceNameCounts.get(normalize(person.name)) === 1;
  person.document = safeDocument ? preferred.document : null;
  person.documentType = safeDocument ? preferred.documentType : "dni";
  person.phone = safeDocument ? preferred.phone : null;
  person.startDate = safeDocument ? preferred.startDate : null;
  person.area = areaFor(person.sourceRole, person.role);
}

const liveStores = await request("tiendas?select=id,nombre,estado,jefe_id&order=id");
const liveUsers = await request("usuarios?select=id,nombres,apellidos,dni,tipo_documento,telefono,fecha_ingreso,rol,tienda_id,estado,usuario&limit=3000");
const storePlan = sourceStores.map((store) => {
  const aliases = new Set([store.name, ...store.aliases].map(normalize));
  const existing = liveStores.find((row) => aliases.has(normalize(row.nombre))) || null;
  return { ...store, existing, action: existing ? (existing.nombre === store.name && existing.estado === "activo" ? "keep" : "update") : "create" };
});

const usersByDocument = new Map(liveUsers.filter((u) => u.dni).map((u) => [u.dni, u]));
const usersByName = new Map();
for (const user of liveUsers) {
  const key = normalize(`${user.nombres || ""} ${user.apellidos || ""}`);
  const rows = usersByName.get(key) || [];
  rows.push(user); usersByName.set(key, rows);
}
const usedUserIds = new Set();
for (const [index, person] of personnel.entries()) {
  const documentMatch = person.document ? usersByDocument.get(person.document) : null;
  const nameMatches = usersByName.get(normalize(person.name)) || [];
  let existing = documentMatch && normalize(`${documentMatch.nombres} ${documentMatch.apellidos}`) === normalize(person.name) ? documentMatch : null;
  if (!existing) existing = nameMatches.find((user) => !usedUserIds.has(user.id)) || null;
  if (existing) usedUserIds.add(existing.id);
  person.existing = existing;
  person.provisionalDocument = !person.document;
  person.document ||= `79${String(person.storeIndex).padStart(2, "0")}${String(index + 1).padStart(4, "0")}`;
  while (usersByDocument.has(person.document) && usersByDocument.get(person.document)?.id !== existing?.id) {
    const next = Number(person.document.slice(-4)) + 1;
    person.document = `${person.document.slice(0, 4)}${String(next).padStart(4, "0")}`;
  }
  person.action = existing ? "update" : "create";
  person.expectedStoreId = storePlan.find((store) => store.name === person.store)?.existing?.id || null;
  person.matchesExpected = Boolean(existing)
    && Number(existing.tienda_id) === Number(person.expectedStoreId)
    && existing.rol === person.role
    && existing.estado === "activo"
    && existing.dni === person.document;
}

const duplicateAssignments = [...sourceNameCounts.entries()].filter(([, count]) => count > 1).map(([key]) => ({ name: personnel.find((p) => normalize(p.name) === key)?.name, assignments: personnel.filter((p) => normalize(p.name) === key).map((p) => `${p.store}: ${p.role}`) }));
const summary = {
  mode: apply ? "apply" : "dry-run",
  source: path.basename(sourcePath),
  sourceUpdated: "2026-04-27",
  stores: { total: storePlan.length, create: storePlan.filter((s) => s.action === "create").length, update: storePlan.filter((s) => s.action === "update").length, keep: storePlan.filter((s) => s.action === "keep").length },
  personnel: { total: personnel.length, create: personnel.filter((p) => p.action === "create").length, update: personnel.filter((p) => p.action === "update").length, verified: personnel.filter((p) => p.matchesExpected).length, mismatches: personnel.filter((p) => !p.matchesExpected).length, sourceDocuments: personnel.filter((p) => !p.provisionalDocument).length, provisionalDocuments: personnel.filter((p) => p.provisionalDocument).length },
  roles: Object.fromEntries([...new Set(personnel.map((p) => p.role))].sort().map((role) => [role, personnel.filter((p) => p.role === role).length])),
  duplicateAssignments,
  storesToCreate: storePlan.filter((s) => s.action === "create").map((s) => s.name),
};
console.log(JSON.stringify(summary, null, 2));
if (!apply) process.exit(0);

const storeIds = new Map();
for (const store of storePlan) {
  let row;
  if (store.existing) {
    [row] = await request(`tiendas?id=eq.${store.existing.id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ nombre: store.name, estado: "activo" }) });
  } else {
    [row] = await request("tiendas", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ nombre: store.name, estado: "activo" }) });
  }
  storeIds.set(store.name, row.id);
}

const importedIds = new Set();
for (const person of personnel) {
  const storeId = storeIds.get(person.store);
  const names = splitName(person.name);
  const payload = {
    ...names, dni: person.document, tipo_documento: person.documentType, telefono: person.phone,
    rol: person.role, tienda_id: storeId, estado: "activo", fecha_ingreso: person.startDate || "2026-04-27",
    area_laboral: person.area,
  };
  let row;
  if (person.existing) {
    [row] = await request(`usuarios?id=eq.${person.existing.id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...payload, usuario: person.existing.usuario }) });
  } else {
    [row] = await request("usuarios", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...payload, usuario: null, password: null }) });
  }
  importedIds.add(row.id);
  person.savedId = row.id;
  const activePeriods = await request(`periodos_laborales?select=id&usuario_id=eq.${row.id}&fecha_salida=is.null&limit=1`);
  if (!activePeriods.length) {
    await request("periodos_laborales", { method: "POST", body: JSON.stringify({ usuario_id: row.id, fecha_ingreso: payload.fecha_ingreso }) });
  }
}

for (const store of sourceStores) {
  const administrator = personnel.find((person) => person.store === store.name && person.role === "jefe_tienda");
  await request(`tiendas?id=eq.${storeIds.get(store.name)}`, { method: "PATCH", body: JSON.stringify({ jefe_id: administrator?.savedId || null }) });
}

console.log(JSON.stringify({ ok: true, storesSaved: storeIds.size, personnelSaved: importedIds.size, existingUnmatchedUsersPreserved: true }, null, 2));
