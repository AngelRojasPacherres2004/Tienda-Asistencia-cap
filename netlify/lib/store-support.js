// Store access is resolved from current database rows, never from a cached grant in the JWT.
const failure = (message, status = 400, code) => Object.assign(new Error(message), { status, code });
const idOf = value => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw failure("Selecciona un registro válido.");
  return id;
};
function checked(result) {
  if (result.error) {
    if (["42P01", "PGRST205"].includes(result.error.code)) throw failure("Falta habilitar Apoyo tienda en la base de datos. Ejecuta su migración.", 503);
    if (result.error.code === "23505") throw failure("Este administrador ya tiene una asignación para esa tienda. Puedes habilitarla desde el listado.", 409);
    throw failure("No se pudo consultar o guardar el apoyo de tienda.", 500);
  }
  return result.data;
}

export async function administratorStores(db, account) {
  if (account.rol !== "jefe_tienda" || account.estado !== "activo") return [];
  const result = await db.from("apoyos_administradores_tienda").select("tienda_id").eq("usuario_id", account.id).eq("habilitado", true);
  // Existing accounts keep their primary store while this additive migration is deployed.
  const assignments = ["42P01", "PGRST205"].includes(result.error?.code) ? [] : checked(result);
  const ids = [...new Set([account.tienda_id, ...assignments.map(row => row.tienda_id)].filter(Boolean).map(Number))];
  if (!ids.length) return [];
  const stores = checked(await db.from("tiendas").select("id,nombre,estado").in("id", ids).eq("estado", "activo").order("nombre"));
  return stores.map(store => ({ id: store.id, nombre: store.nombre, principal: Number(store.id) === Number(account.tienda_id) }))
    .sort((a, b) => Number(b.principal) - Number(a.principal) || a.nombre.localeCompare(b.nombre, "es"));
}

export async function resolveAdministratorContext(db, session, { allowFallback = false, expectedStore } = {}) {
  const account = checked(await db.from("usuarios").select("id,nombres,apellidos,usuario,rol,estado,tienda_id").eq("id", session.id).maybeSingle());
  if (!account || account.estado !== "activo") throw failure("Tu cuenta ya no está activa. Inicia sesión nuevamente.", 401);
  if (account.rol !== "jefe_tienda") {
    if (session.tienda_contexto_id) throw failure("Tu autorización ha cambiado. Inicia sesión nuevamente.", 401);
    return { ...session, ...account, tiendas_disponibles: [] };
  }
  const stores = await administratorStores(db, account);
  const requested = Number(session.tienda_contexto_id || account.tienda_id) || null;
  let selected = stores.find(store => Number(store.id) === requested);
  const revoked = !selected && requested !== null;
  if (revoked && !allowFallback) throw failure("El acceso a esta tienda ya no está habilitado. Volviendo a tu tienda principal.", 403, "STORE_ACCESS_REVOKED");
  if (!selected) selected = stores.find(store => store.principal) || null;
  if (expectedStore && Number(expectedStore) !== Number(selected?.id)) throw failure("La tienda activa cambió en otra ventana. Actualiza la vista antes de continuar.", 409, "STORE_CONTEXT_CHANGED");
  return {
    ...session, ...account,
    tienda_principal_id: account.tienda_id,
    tienda_id: selected?.id || null,
    tienda_nombre: selected?.nombre || null,
    tienda_contexto_id: selected?.id || null,
    tiendas_disponibles: stores,
    apoyo_revocado: revoked,
  };
}

export async function storeSupportCatalog(db, actor, zonalStoreIds) {
  if (actor.rol !== "jefe_zonal") throw failure("Solo el jefe zonal puede administrar estos apoyos.", 403);
  const ids = await zonalStoreIds(actor.id);
  if (!ids.length) return { asignaciones: [], administradores: [], tiendas: [] };
  const [peopleResult, storesResult, rowsResult] = await Promise.all([
    db.from("usuarios").select("id,nombres,apellidos,dni,usuario,rol,estado,tienda_id").eq("rol", "jefe_tienda").in("tienda_id", ids).order("nombres"),
    db.from("tiendas").select("id,nombre,estado").in("id", ids).order("nombre"),
    db.from("apoyos_administradores_tienda").select("id,usuario_id,tienda_id,habilitado,creado_por,created_at,updated_at").in("tienda_id", ids).order("created_at", { ascending: false }),
  ]);
  const people = checked(peopleResult), stores = checked(storesResult), rows = checked(rowsResult);
  // A manager can only see and change grants when both ends are still in their zone.
  const byId = new Map(people.map(person => [Number(person.id), person]));
  const storeNames = new Map(stores.map(store => [Number(store.id), store.nombre]));
  return {
    administradores: people.filter(person => person.estado === "activo"),
    tiendas: stores.filter(store => store.estado === "activo"),
    asignaciones: rows.filter(row => byId.has(Number(row.usuario_id))).map(row => ({
      ...row, administrador: byId.get(Number(row.usuario_id)),
      tienda_nombre: storeNames.get(Number(row.tienda_id)),
      tienda_principal_nombre: storeNames.get(Number(byId.get(Number(row.usuario_id)).tienda_id)),
    })),
  };
}

export async function saveStoreSupport(db, actor, input, zonalStoreIds, assignmentId = null) {
  if (actor.rol !== "jefe_zonal") throw failure("Solo el jefe zonal puede administrar estos apoyos.", 403);
  if (typeof input.habilitado !== "boolean") throw failure("Indica si el apoyo está habilitado.");
  const ids = (await zonalStoreIds(actor.id)).map(Number);
  let assignment;
  if (assignmentId !== null) {
    assignment = checked(await db.from("apoyos_administradores_tienda").select("id,usuario_id,tienda_id").eq("id", idOf(assignmentId)).maybeSingle());
    if (!assignment) throw failure("Asignación no encontrada.", 404);
  }
  const userId = idOf(assignment?.usuario_id ?? input.usuario_id);
  const storeId = idOf(assignment?.tienda_id ?? input.tienda_id);
  if (!ids.includes(storeId)) throw failure("La tienda de apoyo no pertenece a tu zona.", 403);
  const account = checked(await db.from("usuarios").select("id,rol,estado,tienda_id").eq("id", userId).maybeSingle());
  if (!account || account.rol !== "jefe_tienda" || !ids.includes(Number(account.tienda_id))) throw failure("El administrador no pertenece a tu zona o no tiene tienda principal.", 403);
  if (input.habilitado && account.estado !== "activo") throw failure("El administrador debe estar activo para habilitar el apoyo.");
  if (input.habilitado && Number(account.tienda_id) === storeId) throw failure("Selecciona una tienda distinta de su tienda principal.");
  const store = checked(await db.from("tiendas").select("id,estado").eq("id", storeId).maybeSingle());
  if (!store || input.habilitado && store.estado !== "activo") throw failure("La tienda de apoyo debe estar activa.");
  const payload = { habilitado: input.habilitado, actualizado_por: actor.id, updated_at: new Date().toISOString() };
  return checked(assignment
    ? await db.from("apoyos_administradores_tienda").update(payload).eq("id", assignment.id).select("*").single()
    : await db.from("apoyos_administradores_tienda").insert({ ...payload, usuario_id: userId, tienda_id: storeId, creado_por: actor.id }).select("*").single());
}
