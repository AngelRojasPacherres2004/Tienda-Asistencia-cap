/**
 * Sincroniza las credenciales acordadas en public.usuarios, sin incluirlas en Git.
 * Modo por defecto: auditoría sin cambios. Requiere primero el SQL de
 * supabase/sql/unified_portal_access.sql y la API compatible con texto literal.
 */
import process from "node:process";

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY;
const PASSWORD = process.env.PORTAL_INITIAL_PASSWORD;
const APPLY = process.argv.includes("--apply");
if (!URL_BASE || !KEY) throw new Error("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en el entorno del servidor.");
if (APPLY && !PASSWORD) throw new Error("Falta PORTAL_INITIAL_PASSWORD; no se aplicaron cambios.");

const expectedStores = [
  ["T001", "LA MARINA", "mar", "A"], ["T002", "ARAMBURÚ", "ara", "B"],
  ["T003", "EMANCIPACIÓN", "ema", "A"], ["T004", "INDEPENDENCIA", "ind", "A"],
  ["T005", "ALFONSO UGARTE", "alf", "B"], ["T006", "ANGAMOS", "ang", "B"],
  ["T007", "PERSHING", "per", "A"], ["T008", "ALIPIO", "ali", "B"],
  ["T009", "CHORRILLOS", "cho", "B"], ["T010", "TRUJILLO", "tru", "A"],
  ["T011", "PUENTE PIEDRA", "pp", "A"], ["T012", "AYACUCHO", "aya", "A"],
  ["T013", "CALLAO", "cal", "B"], ["T014", "TUMBES", "agu", "A"],
  ["T015", "PLAZA UNIÓN", "pzu", "B"], ["T016", "JR. DE LA UNIÓN 797", "jru", "B"],
  ["T017", "ARGENTINA", "arg", "B"],
];

async function rest(resource, method = "GET", body) {
  const response = await fetch(`${URL_BASE}/rest/v1/${resource}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: resource.startsWith("commercial_user_scopes?")
        ? "resolution=merge-duplicates,return=representation"
        : "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${resource}: HTTP ${response.status} ${text.slice(0, 350)}`);
  return text ? JSON.parse(text) : [];
}

const [users, stores, clusters, roles, mapping] = await Promise.all([
  rest("usuarios?select=id,usuario,rol,tienda_id,estado,dni&limit=5000"),
  rest("tiendas?select=id,nombre,cluster_id,estado&limit=100"),
  rest("clusters?select=id,codigo,jefe_zonal_id,estado&limit=100"),
  rest("roles?select=codigo,activo&limit=100"),
  rest("commercial_store_map?select=dashboard_store_id,tienda_id,cluster_code&limit=100").catch(error => {
    if (APPLY) throw error;
    return [];
  }),
]);
if (APPLY && !roles.some(row => row.codigo === "sistemas" && row.activo)) throw new Error("Falta aplicar el esquema del rol Sistemas.");
const byUsername = new Map(users.filter(row => row.usuario).map(row => [row.usuario.toLowerCase(), row]));
const byStoreId = new Map(stores.map(row => [row.id, row]));
const byCode = new Map(mapping.map(row => [row.dashboard_store_id, row]));
if (!APPLY && !mapping.length) {
  for (const [code, name, , cluster] of expectedStores) {
    const store = stores.find(row => row.nombre === name);
    if (store) byCode.set(code, { dashboard_store_id: code, tienda_id: store.id, cluster_code: cluster });
  }
}
const plan = [];

function add({ username, role, existing, scopeType, scopeValue = null, create = false }) {
  const collision = byUsername.get(username);
  if (collision && collision.id !== existing?.id) throw new Error(`El usuario ${username} ya está asignado a otra persona.`);
  if (existing && existing.rol !== role) throw new Error(`El usuario ${username} tiene el rol inesperado ${existing.rol}.`);
  plan.push({ username, role, id: existing?.id ?? null, scopeType, scopeValue, create });
}

const managers = users.filter(row => row.rol === "gerente_comercial");
const firstManager = byUsername.get("comercial1") ?? managers.find(row => !["comercial2", "comercial3"].includes(row.usuario));
if (!firstManager) throw new Error("No se encontró la cuenta gerente que debe pasar a comercial1.");
add({ username: "comercial1", role: "gerente_comercial", existing: firstManager, scopeType: "all" });
for (const username of ["comercial2", "comercial3"]) {
  add({ username, role: "gerente_comercial", existing: byUsername.get(username), scopeType: "all", create: !byUsername.has(username) });
}
for (const code of ["A", "B"]) {
  const cluster = clusters.find(row => row.codigo === code && row.estado === "activo");
  const zonal = users.find(row => row.id === cluster?.jefe_zonal_id && row.rol === "jefe_zonal");
  if (!zonal) throw new Error(`Falta el zonal activo del clúster ${code}.`);
  add({ username: `zonal${code.toLowerCase()}`, role: "jefe_zonal", existing: zonal, scopeType: "cluster", scopeValue: code });
}
for (const [code, storeName, username, cluster] of expectedStores) {
  const link = byCode.get(code);
  const store = byStoreId.get(link?.tienda_id);
  if (!link || store?.nombre !== storeName || link.cluster_code !== cluster || store.estado !== "activo") {
    throw new Error(`La correspondencia ${code} → ${storeName} no está validada.`);
  }
  const chiefs = users.filter(row => row.rol === "jefe_tienda" && row.tienda_id === store.id && row.estado === "activo");
  if (chiefs.length !== 1) throw new Error(`${storeName} tiene ${chiefs.length} administradores activos; se esperaba uno.`);
  add({ username, role: "jefe_tienda", existing: chiefs[0], scopeType: "store", scopeValue: code });
}
for (const username of ["sistemas1", "sistemas2"]) {
  add({ username, role: "sistemas", existing: byUsername.get(username), scopeType: null, create: !byUsername.has(username) });
}
if (new Set(plan.map(row => row.id).filter(Boolean)).size !== plan.filter(row => row.id).length) {
  throw new Error("Dos credenciales apuntan al mismo usuario existente.");
}

console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", accountCount: plan.length, updates: plan.filter(row => row.id).length, creates: plan.filter(row => row.create).length, accounts: plan.map(({ username, role, scopeType, scopeValue }) => ({ username, role, scopeType, scopeValue })) }, null, 2));
if (!APPLY) process.exit(0);

for (const row of plan) {
  let userId = row.id;
  if (row.create) {
    const created = await rest("usuarios", "POST", {
      nombres: row.role === "sistemas" ? "Sistemas" : "Comercial",
      apellidos: row.username.replace(/\D/g, "") || "Portal",
      dni: null, usuario: row.username, password: PASSWORD,
      rol: row.role, tienda_id: null, estado: "activo", portal_only: true,
      fecha_ingreso: new Date().toISOString().slice(0, 10),
    });
    userId = created[0]?.id;
    if (!userId) throw new Error(`No se pudo crear ${row.username}.`);
  } else {
    await rest(`usuarios?id=eq.${userId}`, "PATCH", { usuario: row.username, password: PASSWORD, estado: "activo" });
  }
  if (row.scopeType) {
    await rest("commercial_user_scopes?on_conflict=usuario_id", "POST", {
      usuario_id: userId, scope_type: row.scopeType, scope_value: row.scopeValue,
    });
  }
}
console.log(JSON.stringify({ ok: true, accountsSynchronized: plan.length, passwordsPrinted: false }));
