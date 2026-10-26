export function createWorkforceDomain({
  activeStoreIds, applyStoreScope, asistenciaEstados, attendanceStaffRoles,
  bodyOf, cleanText, dbError, estadoLabels, fetchAllReportPages, httpError,
  isISODate, operacionesLog, oversightRoles, progresoEstados, readAllResult,
  requireFields, resolveStoreScope, storeStaffRoles, supabase, todayISO,
  userRoles, validateCursoPayload, validateEncargadoPayload, validIds,
  zonalStoreIds,
}) {
  async function listAsistenciasDia(event, user) {
    const query = event.queryStringParameters || {};
    const tiendaScope = await resolveStoreScope(user, query.tienda_id);
    const fecha = query.fecha && isISODate(query.fecha) ? query.fecha : todayISO();
    let empleadosQuery = supabase.from("usuarios").select("id,nombres,apellidos,dni,estado")
      .in("rol", attendanceStaffRoles).order("nombres");
    empleadosQuery = applyStoreScope(empleadosQuery, tiendaScope);
    if (query.estado === "activo" || query.estado === "inactivo") empleadosQuery = empleadosQuery.eq("estado", query.estado);
    let registrosQuery = supabase.from("asistencias").select("*").eq("fecha", fecha);
    registrosQuery = applyStoreScope(registrosQuery, tiendaScope);
    const [{ data: empleados, error: e1 }, { data: registros, error: e2 }] = await Promise.all([
      readAllResult(empleadosQuery),
      readAllResult(registrosQuery),
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
    const { data: empleados, error: eError } = await readAllResult(supabase.from("usuarios")
      .select("id,tienda_id,rol").in("id", usuarioIds));
    if (eError) throw dbError(eError);
    if (empleados.length !== usuarioIds.length || empleados.some((emp) => emp.tienda_id !== user.tienda_id || !attendanceStaffRoles.includes(emp.rol))) {
      throw httpError("La asistencia solo se registra para personal de la tienda que participa en ese control; Seguridad queda excluida.", 400);
    }
    const tiendaByUser = new Map(empleados.map((emp) => [emp.id, emp.tienda_id]));

    const { data: existentes, error: exError } = await readAllResult(supabase.from("asistencias")
      .select("usuario_id,estado,observaciones").eq("fecha", data.fecha).in("usuario_id", usuarioIds));
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
    let tiendaScope = await resolveStoreScope(user, query.tienda_id);
    if (user.rol === "gerencia_general" && !query.tienda_id && query.solo_tiendas_activas === "true") tiendaScope = await activeStoreIds();
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
    const data = await fetchAllReportPages(request.order("id"));
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
      .gte("created_at", `${desde}T00:00:00-05:00`).lte("created_at", `${hasta}T23:59:59.999-05:00`)
      .order("created_at", { ascending: false });
    if (operacionesLog.has(query.operacion)) request = request.eq("operacion", query.operacion);
    const data = await fetchAllReportPages(request.order("id"));
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
    if (desde > hasta) throw httpError("La fecha inicial no puede ser posterior a la final.", 400);
    const data = await fetchAllReportPages(supabase.from("asistencias").select("*")
      .eq("usuario_id", user.id).gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false }).order("id"));
    return data;
  }

  // ---------- Cursos y Encargados (catálogo, solo admin) ----------

  async function listCursos(user) {
    const { data, error } = await readAllResult(supabase.from("cursos").select("*,curso_roles(rol_codigo)").order("nombre"));
    if (error) throw dbError(error);
    const targets = new Set(trainingTargetRoles(user.rol));
    return data
      .map(({ curso_roles, ...curso }) => ({ ...curso, roles: (curso_roles || []).map((row) => row.rol_codigo) }))
      .filter((curso) => user.rol === "coach" || curso.roles.some((role) => targets.has(role)));
  }

  async function replaceCursoRoles(cursoId, roles) {
    const validRoles = [...new Set((roles || []).filter((role) => userRoles.has(role) && role !== "coach"))];
    if (!validRoles.length) throw httpError("Selecciona al menos un rol para la capacitación.", 400);
    const { error: deleteError } = await supabase.from("curso_roles").delete().eq("curso_id", cursoId);
    if (deleteError) throw dbError(deleteError);
    const { error } = await supabase.from("curso_roles").insert(validRoles.map((rol_codigo) => ({ curso_id: cursoId, rol_codigo })));
    if (error) throw dbError(error);
  }

  async function createCurso(event) {
    const data = bodyOf(event);
    validateCursoPayload(data);
    if (!(data.roles || []).some((role) => userRoles.has(role) && role !== "coach")) {
      throw httpError("Selecciona al menos un rol para la capacitación.", 400);
    }
    const { data: created, error } = await supabase.from("cursos")
      .insert({ nombre: cleanText(data.nombre), competencia: cleanText(data.competencia), activo: data.activo !== false })
      .select().single();
    if (error) throw dbError(error);
    await replaceCursoRoles(created.id, data.roles);
    return { ...created, roles: data.roles };
  }

  async function updateCurso(event, id) {
    const data = bodyOf(event);
    validateCursoPayload(data);
    const { error } = await supabase.from("cursos")
      .update({ nombre: cleanText(data.nombre), competencia: cleanText(data.competencia), activo: !!data.activo })
      .eq("id", id);
    if (error) throw dbError(error);
    await replaceCursoRoles(Number(id), data.roles);
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
    const { data, error } = await readAllResult(supabase.from("encargados").select("*").order("nombre"));
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
    if (["gerencia_general", "gerente_comercial"].includes(role)) return ["jefe_zonal"];
    if (role === "coach") return ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda", "jefe_seguridad", "jefe_area", "seguridad", "caja", "almacenero", "vendedor", "asistente", "trabajador"];
    if (role === "jefe_zonal") return ["jefe_tienda"];
    if (role === "jefe_tienda") return ["asistente_tienda", "jefe_seguridad", "jefe_area", "seguridad", "caja", "almacenero", "vendedor", "asistente", "trabajador"];
    if (role === "asistente_tienda") return ["jefe_seguridad", "jefe_area", "seguridad", "caja", "almacenero", "vendedor", "asistente", "trabajador"];
    return [];
  }

  async function assertCursoAsignadoARol(cursoId, role) {
    const { data, error } = await supabase.from("curso_roles")
      .select("curso_id").eq("curso_id", cursoId).eq("rol_codigo", role).maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw httpError("La capacitación no está asignada al rol de esta persona.", 403);
  }

  function trainingReadRoles(user, query) {
    if (user.rol === "coach") {
      let roles = trainingTargetRoles(user.rol);
      if (query.alcance === "zonales") roles = ["jefe_zonal"];
      if (query.alcance === "administradores") roles = ["jefe_tienda"];
      if (query.alcance === "tiendas") roles = storeStaffRoles;
      return query.rol ? roles.filter((role) => role === query.rol) : roles;
    }
    return user.rol === "gerente_comercial" && query.tienda_id ? storeStaffRoles : trainingTargetRoles(user.rol);
  }

  async function listTrabajadores(event, user) {
    const query = event.queryStringParameters || {};
    let targetRoles = trainingReadRoles(user, query);
    if (query.curso_id) {
      const { data: roleRows, error: roleError } = await readAllResult(supabase.from("curso_roles")
        .select("rol_codigo").eq("curso_id", Number(query.curso_id)).order("rol_codigo"), "curso_id");
      if (roleError) throw dbError(roleError);
      const assignedRoles = new Set(roleRows.map((row) => row.rol_codigo));
      targetRoles = targetRoles.filter((role) => assignedRoles.has(role));
    }
    let request = supabase.from("usuarios")
      .select("id,nombres,apellidos,usuario,rol,estado,tienda_id,tiendas!usuarios_tienda_id_fkey(nombre)");
    request = request.in("rol", targetRoles.length ? targetRoles : ["__sin_acceso__"]);
    if (["coach", "gerente_comercial"].includes(user.rol) && query.tienda_id) request = request.eq("tienda_id", Number(query.tienda_id));
    if (["coach", "gerente_comercial"].includes(user.rol) && query.zonal_id) request = request.eq("id", Number(query.zonal_id)).eq("rol", "jefe_zonal");
    if (user.rol === "coach" && query.administrador_id) request = request.eq("id", Number(query.administrador_id)).eq("rol", "jefe_tienda");
    if (user.rol === "jefe_zonal") {
      const ids = await zonalStoreIds(user.id);
      if (!ids.length) return [];
      request = request.in("tienda_id", ids);
    } else if (["jefe_tienda", "asistente_tienda"].includes(user.rol)) {
      request = request.eq("tienda_id", user.tienda_id);
    }
    request = request.order("nombres");
    if (query.estado === "activo" || query.estado === "inactivo") request = request.eq("estado", query.estado);
    const data = await fetchAllReportPages(request.order("id"));
    const people = data.map(({ tiendas, ...row }) => ({ ...row, tienda_nombre: tiendas?.nombre || null }));
    if (!query.curso_id) return people;
    const cursoId = Number(query.curso_id);
    const ids = people.map((t) => t.id);
    const { data: progreso, error: pError } = await readAllResult(supabase.from("capacitacion_progreso")
      .select("usuario_id,estado").eq("curso_id", cursoId).in("usuario_id", ids.length ? ids : [0]));
    if (pError) throw dbError(pError);
    const byUser = new Map(progreso.map((row) => [row.usuario_id, row.estado]));
    return people.map((t) => ({ ...t, progreso_estado: byUser.get(t.id) || "pendiente" }));
  }

  async function assertTrainingTarget(user, target, readOnly = false) {
    if (!target) throw httpError("Persona no encontrada.", 404);
    const roles = readOnly && user.rol === "gerente_comercial" ? ["jefe_zonal", ...storeStaffRoles] : trainingTargetRoles(user.rol);
    if (!roles.includes(target.rol)) throw httpError("La persona no está bajo tu supervisión.", 403);
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
    await assertTrainingTarget(user, trabajador, true);

    const { data: progresoRows, error: progresoError } = await readAllResult(supabase.from("capacitacion_progreso")
      .select("curso_id,estado,duracion_horas,nota,resultado,fecha_finalizacion")
      .eq("usuario_id", id));
    if (progresoError) throw dbError(progresoError);
    const progresoByCurso = new Map(progresoRows.map((row) => [row.curso_id, row]));

    const cursoIdsConHistorial = [...progresoByCurso.keys()];
    let cursosQuery = supabase.from("cursos").select("*");
    cursosQuery = cursoIdsConHistorial.length
      ? cursosQuery.or(`activo.eq.true,id.in.(${cursoIdsConHistorial.join(",")})`)
      : cursosQuery.eq("activo", true);
    const { data: cursos, error: cursosError } = await cursosQuery.order("nombre");
    if (cursosError) throw dbError(cursosError);

    const { data: roleRows, error: roleError } = await readAllResult(supabase.from("curso_roles")
      .select("curso_id").eq("rol_codigo", trabajador.rol).order("rol_codigo"), "curso_id");
    if (roleError) throw dbError(roleError);
    const assignedCursoIds = new Set(roleRows.map((row) => row.curso_id));

    const items = cursos.filter((curso) => assignedCursoIds.has(curso.id) || progresoByCurso.has(curso.id)).map((curso) => {
      const progreso = progresoByCurso.get(curso.id);
      return {
        curso_id: curso.id, titulo: curso.nombre, competencia: curso.competencia, curso_activo: curso.activo,
        estado: progreso?.estado || "pendiente",
        duracion_horas: progreso?.duracion_horas ?? null, resultado: progreso?.resultado ?? "na",
        nota: progreso?.nota ?? null,
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
    if (!['aprobado', 'desaprobado', 'na'].includes(data.resultado || 'na')) throw httpError("El resultado de capacitación no es válido.", 400);
    if (data.nota !== "" && data.nota != null && (!Number.isFinite(Number(data.nota)) || Number(data.nota) < 0 || Number(data.nota) > 20)) throw httpError("La nota debe estar entre 0 y 20.", 400);
    const { data: trabajador, error: tError } = await supabase.from("usuarios")
      .select("id,tienda_id,rol").eq("id", usuarioId).maybeSingle();
    if (tError) throw dbError(tError);
    await assertTrainingTarget(user, trabajador);
    await assertCursoAsignadoARol(Number(cursoId), trabajador.rol);
    const payload = {
      curso_id: Number(cursoId), usuario_id: Number(usuarioId), tienda_id: trabajador.tienda_id,
      estado: data.estado, duracion_horas: data.duracion_horas ? Number(data.duracion_horas) : null,
      nota: data.nota === "" || data.nota == null ? null : Number(data.nota),
      encargado_id: null, resultado: data.resultado || 'na',
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

    const { data: roleRows, error: roleError } = await readAllResult(supabase.from("curso_roles")
      .select("rol_codigo").eq("curso_id", cursoId).order("rol_codigo"), "curso_id");
    if (roleError) throw dbError(roleError);
    const assignedRoles = new Set(roleRows.map((row) => row.rol_codigo));
    const targetRoles = trainingReadRoles(user, query).filter((role) => assignedRoles.has(role));
    let trabajadoresQuery = supabase.from("usuarios").select("id,nombres,apellidos,usuario,rol,tienda_id")
      .eq("estado", "activo").in("rol", targetRoles.length ? targetRoles : ["__sin_acceso__"]);
    if (["coach", "gerente_comercial"].includes(user.rol) && query.zonal_id) trabajadoresQuery = trabajadoresQuery.eq("id", Number(query.zonal_id)).eq("rol", "jefe_zonal");
    if (user.rol === "coach" && query.administrador_id) trabajadoresQuery = trabajadoresQuery.eq("id", Number(query.administrador_id)).eq("rol", "jefe_tienda");
    if (user.rol === "jefe_zonal") {
      const ids = await zonalStoreIds(user.id);
      if (tiendaId && !ids.includes(tiendaId)) throw httpError("La tienda no pertenece a tu clúster.", 403);
      trabajadoresQuery = trabajadoresQuery.in("tienda_id", tiendaId ? [tiendaId] : (ids.length ? ids : [0]));
    } else {
      if (["jefe_tienda", "asistente_tienda"].includes(user.rol)) trabajadoresQuery = trabajadoresQuery.eq("tienda_id", user.tienda_id);
      else if (tiendaId) trabajadoresQuery = trabajadoresQuery.eq("tienda_id", tiendaId);
    }
    const { data: trabajadores, error: tError } = await readAllResult(trabajadoresQuery.order("id"));
    if (tError) throw dbError(tError);

    const ids = trabajadores.map((t) => t.id);
    const { data: progresoRows, error: pError } = await readAllResult(supabase.from("capacitacion_progreso")
      .select("usuario_id,estado,duracion_horas,nota,fecha_finalizacion")
      .eq("curso_id", cursoId).in("usuario_id", ids.length ? ids : [0]));
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
        nota: progreso?.nota ?? null,
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
    const { data: trabajadores, error: tError } = await readAllResult(supabase.from("usuarios")
      .select("id,tienda_id,rol").in("id", ids));
    if (tError) throw dbError(tError);
    if (trabajadores.length !== ids.length) throw httpError("Una de las personas seleccionadas no existe.", 400);
    for (const trabajador of trabajadores) {
      await assertTrainingTarget(user, trabajador);
      await assertCursoAsignadoARol(cursoId, trabajador.rol);
    }
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
    const { data: progresoRows, error } = await readAllResult(supabase.from("capacitacion_progreso")
      .select("curso_id,estado,duracion_horas,nota,fecha_finalizacion,cursos(id,nombre,competencia,activo)")
      .eq("usuario_id", user.id));
    if (error) throw dbError(error);
    const progresoByCurso = new Map(progresoRows.filter((row) => row.cursos).map((row) => [row.curso_id, row]));
    const { data: asignaciones, error: aError } = await readAllResult(supabase.from("curso_roles").select("curso_id").eq("rol_codigo", user.rol).order("rol_codigo"), "curso_id");
    if (aError) throw dbError(aError);
    const assignedIds = asignaciones.map((row) => row.curso_id);
    const { data: cursosActivos, error: cError } = assignedIds.length
      ? await supabase.from("cursos").select("id,nombre,competencia,activo").eq("activo", true).in("id", assignedIds)
      : { data: [], error: null };
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
        nota: progreso?.nota ?? null,
        fecha_finalizacion: progreso?.fecha_finalizacion ?? null,
      };
    }).sort((a, b) => a.titulo.localeCompare(b.titulo));
  }

  return { listAsistenciasDia, guardarAsistenciasLote, eliminarAsistencia, listAsistenciasHistorial, listLogAsistencias, misAsistencias, listCursos, createCurso, updateCurso, deleteCurso, listEncargados, createEncargado, updateEncargado, listTrabajadores, getTrabajadorPerfil, guardarProgreso, getResumenCurso, asignarLote, misCapacitaciones };
}
