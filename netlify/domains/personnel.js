export function createPersonnelDomain({ supabase, readAllResult, fetchAllReportPages, dbError, httpError, cleanText, cleanUsuario, bodyOf, hashOperationalPassword, validateUserPayload, storeManagementRoles, centralRoles, normalizeLaborArea, normalizeDepartureReason, normalizedPersonnelFields, createExcelWorkbook, styleHeader, excelResponse }) {
  function mapUserRow(row) {
    const { tiendas, ...rest } = row;
    return { ...rest, tienda_nombre: tiendas?.nombre || null };
  }

  async function zonalStoreIds(userId) {
    const { data: cluster, error: clusterError } = await supabase.from("clusters").select("id").eq("jefe_zonal_id", userId).maybeSingle();
    if (clusterError) throw dbError(clusterError);
    if (!cluster) return [];
    const { data, error } = await readAllResult(supabase.from("tiendas").select("id").eq("cluster_id", cluster.id));
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
      if (!user.tienda_id) throw httpError("Tu usuario no tiene una tienda asignada.", 403);
      if (requestedId && Number(user.tienda_id) !== requestedId) throw httpError("Solo puedes consultar los datos de tu tienda.", 403);
      return user.tienda_id;
    }
    return user.tienda_id || null;
  }

  async function activeStoreIds() {
    const { data, error } = await readAllResult(supabase.from("tiendas").select("id").eq("estado", "activo"));
    if (error) throw dbError(error);
    return (data || []).map((store) => store.id);
  }

  function allowedCreatedRoles(actor) {
    if (actor.rol === "gerencia_general") return new Set(["gerente_comercial", "coach", "administrador_seguridad"]);
    if (actor.rol === "gerente_comercial") return new Set(["jefe_zonal"]);
    if (actor.rol === "jefe_zonal") return new Set(["jefe_tienda"]);
    if (actor.rol === "jefe_tienda") return new Set(["asistente_tienda", "jefe_seguridad", "jefe_area", "seguridad", "caja", "almacenero", "vendedor", "asistente", "trabajador"]);
    if (actor.rol === "asistente_tienda") return new Set(["jefe_seguridad", "jefe_area", "seguridad", "caja", "almacenero", "vendedor", "asistente", "trabajador"]);
    return new Set();
  }

  async function assertUserScope(actor, role, tiendaId) {
    if (!allowedCreatedRoles(actor).has(role)) throw httpError("No puedes administrar usuarios de ese rango.", 403);
    if (actor.rol === "jefe_zonal") {
      if (role === "jefe_tienda" && !tiendaId) return;
      const ids = await zonalStoreIds(actor.id);
      if (!ids.includes(Number(tiendaId))) throw httpError("La tienda no está asignada a tu zona.", 403);
    }
    if (storeManagementRoles.has(actor.rol) && Number(tiendaId) !== Number(actor.tienda_id)) {
      throw httpError("Solo puedes administrar usuarios de tu tienda.", 403);
    }
  }

  async function listUsers(actor, storeId = null, options = {}) {
    if (actor.rol === "jefe_zonal" && storeId) {
      const ids = await zonalStoreIds(actor.id);
      if (!ids.includes(Number(storeId))) throw httpError("La tienda no está asignada a tu zona.", 403);
    }
    let request = supabase
      .from("usuarios")
      .select("id,nombres,apellidos,dni,tipo_documento,usuario,telefono,email,fecha_nacimiento,mes_cumpleanos,sueldo,sexo,nacionalidad,direccion,distrito,area_laboral,carrera,grado_academico,ciclo_semestre,regimen_jornada,tipo_turno,tiene_parentesco,tipo_parentesco,familiar_vinculo,estado_civil,numero_hijos,talla_zapatillas,talla_polo,telefono_emergencia,alergia,condicion_salud,rol,tienda_id,estado,fecha_ingreso,fecha_salida,fecha_creacion,tiendas!usuarios_tienda_id_fkey(nombre)")
      .order("nombres");
    if (actor.rol === "gerencia_general" && !storeId) request = request.in("rol", ["gerente_comercial", "coach", "administrador_seguridad"]);
    if (actor.rol === "gerente_comercial" && !storeId) request = request.eq("rol", "jefe_zonal");
    if (actor.rol === "jefe_zonal" && !storeId) {
      const ids = await zonalStoreIds(actor.id);
      if (options.includeZonalTeam) {
        request = ids.length
          ? request.or(`tienda_id.in.(${ids.join(",")}),and(rol.eq.jefe_tienda,zonal_creador_id.eq.${actor.id})`)
          : request.eq("zonal_creador_id", actor.id).eq("rol", "jefe_tienda");
      } else {
        request = request.eq("rol", "jefe_tienda");
        request = ids.length ? request.or(`tienda_id.in.(${ids.join(",")}),zonal_creador_id.eq.${actor.id}`) : request.eq("zonal_creador_id", actor.id);
      }
    }
    if (actor.rol === "jefe_tienda") request = request.eq("tienda_id", actor.tienda_id).in("rol", ["asistente_tienda", "jefe_seguridad", "jefe_area", "seguridad", "caja", "almacenero", "vendedor", "asistente", "trabajador"]);
    if (actor.rol === "asistente_tienda") request = request.eq("tienda_id", actor.tienda_id).in("rol", ["jefe_seguridad", "jefe_area", "seguridad", "caja", "almacenero", "vendedor", "asistente", "trabajador"]);
    if (storeId) request = request.eq("tienda_id", storeId);
    const data = await fetchAllReportPages(request.order("id"));
    if (!data?.length) return [];
    const ids = data.map(row => row.id);
    const [optionalResult, periodsResult] = await Promise.allSettled([
      readAllResult(supabase.from("usuarios").select("id,contacto_emergencia,motivo_salida").in("id", ids)),
      readAllResult(supabase.from("periodos_laborales").select("usuario_id,id").in("usuario_id", ids)),
    ]);
    const optionalRows = optionalResult.status === "fulfilled" ? optionalResult.value.data : [];
    const periods = periodsResult.status === "fulfilled" ? periodsResult.value.data : [];
    const optionalById = new Map((optionalRows || []).map((row) => [row.id, row]));
    const periodCount = new Map();
    for (const period of periods || []) periodCount.set(period.usuario_id, (periodCount.get(period.usuario_id) || 0) + 1);
    const rows = data.map((row) => ({
      ...mapUserRow(row), ...(optionalById.get(row.id) || {}),
      area_laboral: normalizeLaborArea(row.area_laboral) || null,
      motivo_salida: normalizeDepartureReason(optionalById.get(row.id)?.motivo_salida) || null,
      reingreso: (periodCount.get(row.id) || 0) > 1,
    }));
    if (["gerencia_general", "gerente_comercial"].includes(actor.rol) && rows.some((row) => row.rol === "jefe_zonal")) {
      const { data: assignments, error: assignmentError } = await supabase
        .from("clusters").select("id,nombre,jefe_zonal_id,tiendas(id)").in("jefe_zonal_id", rows.filter((row) => row.rol === "jefe_zonal").map((row) => row.id));
      if (assignmentError) throw dbError(assignmentError);
      for (const row of rows) {
        const cluster = (assignments || []).find((item) => item.jefe_zonal_id === row.id);
        row.cluster_id = cluster?.id || null; row.cluster_nombre = cluster?.nombre || null; row.tienda_ids = (cluster?.tiendas || []).map((item) => item.id);
      }
    }
    return rows.sort((a, b) => (a.estado === "activo" ? 0 : 1) - (b.estado === "activo" ? 0 : 1)
      || `${a.nombres} ${a.apellidos}`.localeCompare(`${b.nombres} ${b.apellidos}`, "es"));
  }

  async function ensureUniqueUser(usuario, dni, excludeId) {
    let byUsuario = usuario ? supabase.from("usuarios").select("id").eq("usuario", usuario) : null;
    let byDni = supabase.from("usuarios").select("id").eq("dni", dni);
    if (excludeId) {
      if (byUsuario) byUsuario = byUsuario.neq("id", excludeId);
      byDni = byDni.neq("id", excludeId);
    }
    const [usuarioResult, dniResult] = await Promise.all([byUsuario || Promise.resolve({ data: [] }), byDni]);
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
    const usuario = cleanUsuario(data.usuario) || null;
    const dni = cleanText(data.dni);
    await ensureUniqueUser(usuario, dni);
    if (!centralRoles.has(data.rol) && data.tienda_id) await ensureTiendaActiva(data.tienda_id);
    if (data.rol === "jefe_tienda" && data.tienda_id) await ensureStoreWithoutOtherChief(Number(data.tienda_id));
    const password = await hashOperationalPassword(data.password);
    const personnel = normalizedPersonnelFields(data);
    const { data: created, error } = await supabase.from("usuarios").insert({
      nombres: cleanText(data.nombres), apellidos: cleanText(data.apellidos), dni, tipo_documento: data.tipo_documento || "dni", usuario, password,
      telefono: data.telefono ? cleanText(data.telefono) : null, email: data.email ? cleanText(data.email).toLowerCase() : null, rol: data.rol,
      tienda_id: centralRoles.has(data.rol) || !data.tienda_id ? null : Number(data.tienda_id), zonal_creador_id: actor.rol === "jefe_zonal" ? actor.id : null, estado: data.fecha_salida ? "inactivo" : data.estado,
      fecha_ingreso: data.fecha_ingreso, fecha_salida: data.fecha_salida || null,
      condicion_salud: data.condicion_salud ? cleanText(data.condicion_salud) : null,
      fecha_nacimiento: data.fecha_nacimiento || null, mes_cumpleanos: data.mes_cumpleanos || null, sueldo: data.sueldo === "" || data.sueldo == null ? null : Number(data.sueldo),
      sexo: data.sexo || "no_especificado", direccion: data.direccion ? cleanText(data.direccion) : null, distrito: personnel.distrito,
      nacionalidad: personnel.nacionalidad, area_laboral: data.area_laboral ? normalizeLaborArea(data.area_laboral) : null, carrera: personnel.carrera,
      grado_academico: data.grado_academico || "sin_especificar", ciclo_semestre: data.grado_academico === "universitario" && data.ciclo_semestre ? cleanText(data.ciclo_semestre) : null,
      regimen_jornada: data.regimen_jornada || null, tipo_turno: data.tipo_turno || null,
      tiene_parentesco: Boolean(data.tiene_parentesco), tipo_parentesco: data.tiene_parentesco ? cleanText(data.tipo_parentesco) : null,
      familiar_vinculo: data.tiene_parentesco ? cleanText(data.familiar_vinculo) : null,
      estado_civil: data.estado_civil || "sin_especificar",
      numero_hijos: data.numero_hijos === "" || data.numero_hijos == null ? 0 : Number(data.numero_hijos),
      talla_zapatillas: data.talla_zapatillas === "" || data.talla_zapatillas == null ? null : Number(data.talla_zapatillas),
      talla_polo: data.talla_polo || "sin_especificar",
      telefono_emergencia: data.telefono_emergencia ? cleanText(data.telefono_emergencia) : null,
      alergia: data.alergia ? cleanText(data.alergia) : null,
    }).select("id,nombres,apellidos,dni,usuario,telefono,rol,tienda_id,estado,fecha_ingreso,fecha_salida").single();
    if (error) throw dbError(error);
    await saveOptionalPersonnelFields(created.id, data);
    await syncEmploymentPeriod(created.id, data, actor.id);
    if (data.rol === "jefe_tienda" && data.tienda_id) await linkStoreChief(created.id, Number(data.tienda_id));
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
        usuario: cleanUsuario(data.usuario) || null, telefono: data.telefono ? cleanText(data.telefono) : null,
        password: data.password ? String(data.password) : null, rol: "trabajador", tienda_id: actor.tienda_id, estado: "activo",
        fecha_ingreso: data.fecha_ingreso, fecha_salida: null,
      };
    });
    const usuariosSet = new Set();
    const dniSet = new Set();
    for (const row of prepared) {
      if (row.usuario && usuariosSet.has(row.usuario)) throw httpError(`El usuario "${row.usuario}" está repetido en el Excel.`, 400);
      if (dniSet.has(row.dni)) throw httpError(`El DNI "${row.dni}" está repetido en el Excel.`, 400);
      if (row.usuario) usuariosSet.add(row.usuario); dniSet.add(row.dni);
    }
    const [{ data: existingUsers, error: userError }, { data: existingDnis, error: dniError }] = await Promise.all([
      usuariosSet.size ? supabase.from("usuarios").select("id,usuario,dni").in("usuario", [...usuariosSet]) : Promise.resolve({ data: [] }),
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
      ...row, password: await hashOperationalPassword(row.password),
    })));
    if (rows.length) {
      const { error } = await supabase.from("usuarios").insert(rows);
      if (error) throw dbError(error);
    }
    return { creados: rows.length, omitidos: prepared.length - rows.length };
  }

  async function updateUser(event, id, actor) {
    const data = bodyOf(event);
    const { data: current } = await supabase.from("usuarios").select("rol,estado,dni,tienda_id,fecha_salida,password,zonal_creador_id").eq("id", id).maybeSingle();
    if (!current) throw httpError("Usuario no encontrado.", 404);
    if (storeManagementRoles.has(actor.rol)) data.tienda_id = actor.tienda_id;
    validateUserPayload(data);
    if (actor.rol === "jefe_zonal" && current.rol === "jefe_tienda" && !current.tienda_id && Number(current.zonal_creador_id) !== Number(actor.id)) {
      throw httpError("El administrador no pertenece a tu zona.", 403);
    }
    await assertUserScope(actor, current.rol, current.tienda_id);
    if (actor.rol === "jefe_zonal" && data.tienda_id) await assertUserScope(actor, data.rol, data.tienda_id);
    const rehire = data.reingreso_confirmado === true;
    if (rehire && (current.estado !== "inactivo" || current.dni !== cleanText(data.dni) || !current.fecha_salida || data.fecha_ingreso <= current.fecha_salida || data.fecha_salida)) {
      throw httpError("El reingreso requiere una ficha inactiva del mismo DNI y una fecha posterior a la baja.", 400);
    }
    if (data.rol !== current.rol) throw httpError("No se permite cambiar el rango de un usuario existente. Solicita el cambio de cargo antes del reingreso.", 400);
    if (actor.rol === "gerente_comercial" && data.rol === "jefe_zonal") await validateZonalCluster(data.cluster_id, id);
    const usuario = cleanUsuario(data.usuario) || null;
    const dni = cleanText(data.dni);
    await ensureUniqueUser(usuario, dni, id);
    if (!centralRoles.has(data.rol) && data.tienda_id) await ensureTiendaActiva(data.tienda_id);
    if (data.rol === "jefe_tienda" && data.tienda_id) await ensureStoreWithoutOtherChief(Number(data.tienda_id), id);
    const nextState = data.fecha_salida ? "inactivo" : data.estado;
    const personnel = normalizedPersonnelFields(data);
    const nextStoreId = data.rol === "jefe_tienda" && nextState === "inactivo" ? null : data.tienda_id;
    const payload = {
      nombres: cleanText(data.nombres), apellidos: cleanText(data.apellidos), dni, tipo_documento: data.tipo_documento || "dni", usuario,
      telefono: data.telefono ? cleanText(data.telefono) : null, email: data.email ? cleanText(data.email).toLowerCase() : null, rol: data.rol,
      tienda_id: centralRoles.has(data.rol) || !nextStoreId ? null : Number(nextStoreId), estado: nextState,
      fecha_ingreso: data.fecha_ingreso, fecha_salida: data.fecha_salida || null,
      condicion_salud: data.condicion_salud ? cleanText(data.condicion_salud) : null,
      fecha_nacimiento: data.fecha_nacimiento || null, mes_cumpleanos: data.mes_cumpleanos || null, sueldo: data.sueldo === "" || data.sueldo == null ? null : Number(data.sueldo),
      sexo: data.sexo || "no_especificado", direccion: data.direccion ? cleanText(data.direccion) : null, distrito: personnel.distrito,
      nacionalidad: personnel.nacionalidad, area_laboral: data.area_laboral ? normalizeLaborArea(data.area_laboral) : null, carrera: personnel.carrera,
      grado_academico: data.grado_academico || "sin_especificar", ciclo_semestre: data.grado_academico === "universitario" && data.ciclo_semestre ? cleanText(data.ciclo_semestre) : null,
      regimen_jornada: data.regimen_jornada || null, tipo_turno: data.tipo_turno || null,
      tiene_parentesco: Boolean(data.tiene_parentesco), tipo_parentesco: data.tiene_parentesco ? cleanText(data.tipo_parentesco) : null,
      familiar_vinculo: data.tiene_parentesco ? cleanText(data.familiar_vinculo) : null,
      estado_civil: data.estado_civil || "sin_especificar",
      numero_hijos: data.numero_hijos === "" || data.numero_hijos == null ? 0 : Number(data.numero_hijos),
      talla_zapatillas: data.talla_zapatillas === "" || data.talla_zapatillas == null ? null : Number(data.talla_zapatillas),
      talla_polo: data.talla_polo || "sin_especificar",
      telefono_emergencia: data.telefono_emergencia ? cleanText(data.telefono_emergencia) : null,
      alergia: data.alergia ? cleanText(data.alergia) : null,
    };
    if (data.password) payload.password = await hashOperationalPassword(data.password);
    const { error } = await supabase.from("usuarios").update(payload).eq("id", id);
    if (error) throw dbError(error);
    await saveOptionalPersonnelFields(id, data);
    await syncEmploymentPeriod(id, data, actor.id);
    if (data.rol === "jefe_tienda" && nextStoreId) await linkStoreChief(id, Number(nextStoreId), current.tienda_id);
    if (data.rol === "jefe_tienda" && !nextStoreId && current.tienda_id) {
      const released = await supabase.from("tiendas").update({ jefe_id: null }).eq("id", current.tienda_id).eq("jefe_id", id);
      if (released.error) throw dbError(released.error);
    }
    if (data.rol === "jefe_zonal") await assignZonalCluster(id, Number(data.cluster_id));
  }

  async function saveOptionalPersonnelFields(id, data) {
    const { error } = await supabase.from("usuarios").update({
      contacto_emergencia: data.contacto_emergencia ? cleanText(data.contacto_emergencia) : null,
      motivo_salida: data.motivo_salida ? normalizeDepartureReason(data.motivo_salida) : null,
    }).eq("id", id);
    if (error && !["42703", "PGRST204"].includes(error.code)) throw dbError(error);
  }

  async function syncEmploymentPeriod(userId, data, actorId) {
    const { data: latest, error: readError } = await supabase.from("periodos_laborales")
      .select("id,fecha_ingreso,fecha_salida").eq("usuario_id", userId)
      .order("fecha_ingreso", { ascending: false }).limit(1).maybeSingle();
    if (readError) throw dbError(readError);
    const row = {
      fecha_ingreso: data.fecha_ingreso,
      fecha_salida: data.fecha_salida || null,
      motivo_salida: data.fecha_salida ? normalizeDepartureReason(data.motivo_salida) : null,
      registrado_por: actorId,
      updated_at: new Date().toISOString(),
    };
    const opensNewPeriod = latest?.fecha_salida && !row.fecha_salida && row.fecha_ingreso > latest.fecha_salida;
    const request = !latest || opensNewPeriod
      ? supabase.from("periodos_laborales").insert({ usuario_id: userId, ...row })
      : supabase.from("periodos_laborales").update(row).eq("id", latest.id);
    const { error } = await request;
    if (error) throw dbError(error);
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
        const usuario = cleanUsuario(data.usuario) || null;
        const dni = cleanText(data.dni);
        await ensureUniqueUser(usuario, dni);
        if (!centralRoles.has(data.rol)) await ensureTiendaActiva(data.tienda_id);
        const password = await hashOperationalPassword(data.password);
        const { error } = await supabase.from("usuarios").insert({
          nombres: cleanText(data.nombres), apellidos: cleanText(data.apellidos), dni, tipo_documento: data.tipo_documento || "dni", usuario, password,
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
    const workbook = await createExcelWorkbook();
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

  return { zonalStoreIds, resolveStoreScope, activeStoreIds, listUsers, ensureUniqueUser, createUser, importStoreUsers, updateUser, deleteUser, importUsersAdmin, exportUsersExcelAdmin };
}
