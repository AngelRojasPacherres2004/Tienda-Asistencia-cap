export function createStoresDomain({ supabase, readAllResult, dbError, httpError, validIds, bodyOf, requireFields, cleanText, zonalStoreIds, fetchAllReportPages, validateTiendaPayload }) {
  async function listClusters() {
    const { data, error } = await readAllResult(supabase.from("clusters")
      .select("id,nombre,codigo,estado,jefe_zonal_id,created_at,jefe:usuarios!clusters_jefe_zonal_id_fkey(id,nombres,apellidos,usuario),tiendas(id,nombre,estado)")
      .order("nombre"));
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
    const { data: stores, error: storeError } = await readAllResult(supabase.from("tiendas").select("id").in("id", ids));
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
      .select("id,nombre,codigo,direccion,distrito,provincia,departamento,zona,formato,fecha_apertura,fecha_cierre,metraje_m2,capacidad_stock_unid,capacidad_stock_calzado_unid,capacidad_stock_textil_unid,cant_colaboradores_normal,colaboradores_camp,alquiler_mensual,estado,fecha_creacion,jefe_id,cluster_id,zonal_id,jefe:usuarios!tiendas_jefe_fk(id,nombres,apellidos,estado),cluster:clusters(id,nombre,codigo)")
      .order("nombre");
    if (actor?.rol === "jefe_zonal") {
      const ids = await zonalStoreIds(actor.id);
      if (!ids.length) return [];
      request = request.in("id", ids);
    }
    const data = await fetchAllReportPages(request.order("id"));
    return data.map(({ jefe, cluster, ...row }) => ({
      ...row,
      jefe_nombre: jefe ? `${jefe.nombres} ${jefe.apellidos}` : null,
      jefe_estado: jefe?.estado || null,
      cluster_nombre: cluster?.nombre || null,
    }));
  }

  async function listStoreCatalogs() {
    const { data, error } = await supabase
      .from("tiendas")
      .select("departamento,provincia,distrito");
    if (error) throw dbError(error);
    const unique = new Map();
    for (const row of data || []) {
      const ubicacion = {
        departamento: cleanText(row.departamento).toUpperCase(),
        provincia: cleanText(row.provincia).toUpperCase(),
        distrito: cleanText(row.distrito).toUpperCase(),
      };
      if (!ubicacion.departamento || !ubicacion.provincia || !ubicacion.distrito) continue;
      unique.set(`${ubicacion.departamento}|${ubicacion.provincia}|${ubicacion.distrito}`, ubicacion);
    }
    return {
      ubicaciones: [...unique.values()].sort((a, b) =>
        `${a.departamento}|${a.provincia}|${a.distrito}`.localeCompare(`${b.departamento}|${b.provincia}|${b.distrito}`, "es")),
      formatos: ["PROPIA", "METRO"],
    };
  }

  async function syncJefe(tiendaId, jefeId) {
    const { data: jefe } = await supabase.from("usuarios").select("id,rol,tienda_id,estado").eq("id", jefeId).maybeSingle();
    if (!jefe || jefe.estado !== "activo") throw httpError("El usuario seleccionado como jefe no existe o está inactivo.", 400);
    if (jefe.rol !== "jefe_tienda") throw httpError("Selecciona un jefe de tienda activo.", 400);
    if (jefe.tienda_id && Number(jefe.tienda_id) !== Number(tiendaId)) throw httpError("El administrador ya pertenece a otra tienda.", 400);
    const { error } = await supabase.from("usuarios").update({ tienda_id: Number(tiendaId) }).eq("id", jefeId);
    if (error) throw dbError(error);
  }

  async function ensureClusterActive(clusterId) {
    const { data, error } = await supabase.from("clusters").select("id,estado").eq("id", clusterId).maybeSingle();
    if (error) throw dbError(error);
    if (!data || data.estado !== "activo") throw httpError("Selecciona un clúster activo.", 400);
  }

  async function zonalClusterId(userId) {
    const { data, error } = await supabase.from("clusters").select("id").eq("jefe_zonal_id", userId).eq("estado", "activo").maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw httpError("No tienes una zona activa asignada.", 400);
    return data.id;
  }

  async function assertZonalChief(actor, chiefId) {
    if (actor.rol !== "jefe_zonal" || !chiefId) return;
    const ids = await zonalStoreIds(actor.id);
    const { data, error } = await supabase.from("usuarios").select("id,tienda_id,zonal_creador_id,rol").eq("id", Number(chiefId)).maybeSingle();
    if (error) throw dbError(error);
    if (!data || data.rol !== "jefe_tienda" || (Number(data.zonal_creador_id) !== Number(actor.id) && !ids.includes(Number(data.tienda_id)))) throw httpError("El administrador no pertenece a tu zona.", 403);
  }

  function tiendaPayload(data) {
    const text = (value) => cleanText(value) || null;
    const number = (value) => value === "" || value == null ? null : Number(value);
    return {
      nombre: cleanText(data.nombre), codigo: text(data.codigo)?.toUpperCase() || null,
      direccion: text(data.direccion), distrito: text(data.distrito)?.toUpperCase() || null,
      provincia: text(data.provincia)?.toUpperCase() || null,
      departamento: text(data.departamento)?.toUpperCase() || null,
      zona: text(data.zona)?.toUpperCase() || null, formato: text(data.formato)?.toUpperCase() || null,
      fecha_apertura: data.fecha_apertura || null,
      fecha_cierre: data.fecha_cierre || null, metraje_m2: number(data.metraje_m2),
      capacidad_stock_unid: number(data.capacidad_stock_unid),
      capacidad_stock_calzado_unid: number(data.capacidad_stock_calzado_unid),
      capacidad_stock_textil_unid: number(data.capacidad_stock_textil_unid),
      cant_colaboradores_normal: number(data.cant_colaboradores_normal),
      colaboradores_camp: number(data.colaboradores_camp), alquiler_mensual: number(data.alquiler_mensual),
      estado: data.estado, cluster_id: data.cluster_id ? Number(data.cluster_id) : null,
    };
  }

  async function createTienda(event, actor) {
    const data = bodyOf(event);
    validateTiendaPayload(data);
    if (actor.rol === "jefe_zonal") data.cluster_id = await zonalClusterId(actor.id);
    if (!data.cluster_id) throw httpError("Selecciona el clúster de la tienda.", 400);
    await ensureClusterActive(Number(data.cluster_id));
    await assertZonalChief(actor, data.jefe_id);
    const { data: created, error } = await supabase.from("tiendas")
      .insert(tiendaPayload(data))
      .select("id").single();
    if (error) throw dbError(error);
    if (data.jefe_id) {
      await syncJefe(created.id, Number(data.jefe_id));
      const { error: linkError } = await supabase.from("tiendas").update({ jefe_id: Number(data.jefe_id) }).eq("id", created.id);
      if (linkError) throw dbError(linkError);
    }
    return created;
  }

  async function updateTienda(event, id, actor) {
    const data = bodyOf(event);
    validateTiendaPayload(data);
    if (actor.rol === "jefe_zonal") {
      const clusterId = await zonalClusterId(actor.id);
      const { data: store, error } = await supabase.from("tiendas").select("id,jefe_id").eq("id", id).eq("cluster_id", clusterId).maybeSingle();
      if (error) throw dbError(error); if (!store) throw httpError("La tienda no pertenece a tu zona.", 403);
      data.cluster_id = clusterId;
    }
    if (!data.cluster_id) throw httpError("Selecciona el clúster de la tienda.", 400);
    await ensureClusterActive(Number(data.cluster_id));
    await assertZonalChief(actor, data.jefe_id);
    const { data: previousStore, error: previousError } = await supabase.from("tiendas").select("jefe_id").eq("id", id).maybeSingle();
    if (previousError) throw dbError(previousError);
    const jefeId = data.jefe_id ? Number(data.jefe_id) : null;
    if (jefeId) await syncJefe(Number(id), jefeId);
    const { error } = await supabase.from("tiendas").update({
      ...tiendaPayload(data), jefe_id: jefeId,
    }).eq("id", id);
    if (error) throw dbError(error);
    if (previousStore?.jefe_id && Number(previousStore.jefe_id) !== jefeId) {
      const released = await supabase.from("usuarios").update({ tienda_id: null }).eq("id", previousStore.jefe_id).eq("rol", "jefe_tienda");
      if (released.error) throw dbError(released.error);
    }
  }

  return { listClusters, createCluster, updateCluster, deleteCluster, listTiendas, listStoreCatalogs, createTienda, updateTienda };
}
