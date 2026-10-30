export function createZonalDomain({
  attendanceStaffRoles, bodyOf, cleanText, createExcelWorkbook, dbError,
  employmentPeriods, excelResponse, fetchAllReportPages, formatLimaDate,
  httpError, isISODate, isSecurityIncident, listClusters, listTiendas,
  listUsers, pendingAttendance, presenteEstados, readAllResult,
  requireFields, storeStaffRoles, styleHeader, supabase, todayISO,
  zonalStoreIds,
}) {
  const auditPayloadPrefix = "AUDITORIA_DIGITAL_V1:";
  const auditSectionIds = ["infraestructura", "marketing", "documentos_sistemas", "personal", "seguridad"];
  const auditItemIds = new Set([
    ...Array.from({ length: 7 }, (_, index) => `1.${index + 1}`),
    ...Array.from({ length: 9 }, (_, index) => `2.${index + 1}`),
    "3.1", "3.2", ...Array.from({ length: 19 }, (_, index) => `3.${index + 6}`),
    ...Array.from({ length: 6 }, (_, index) => `4.${index + 1}`),
    ...Array.from({ length: 3 }, (_, index) => `5.${index + 1}`),
  ]);

  function parseAuditDetails(value) {
    const raw = String(value || "");
    if (!raw.startsWith(auditPayloadPrefix)) return null;
    try { return JSON.parse(raw.slice(auditPayloadPrefix.length)); }
    catch { return null; }
  }

  function serializeVisit(visit) {
    const detail = parseAuditDetails(visit.observacion_general);
    return {
      ...visit,
      observacion_general: detail?.generalNote || (detail ? "" : visit.observacion_general),
      detalle_checklist: detail,
    };
  }

  async function zonalScope(user) {
    if (user.rol === "gerencia_general") {
      const { data, error } = await readAllResult(supabase.from("tiendas").select("id,nombre,direccion,estado,jefe_id,cant_colaboradores_normal,colaboradores_camp").order("nombre"));
      if (error) throw dbError(error);
      return { ids: (data || []).map((store) => store.id), stores: data || [] };
    }
    const ids = await zonalStoreIds(user.id);
    if (!ids.length) return { ids: [], stores: [] };
    const { data, error } = await readAllResult(supabase.from("tiendas").select("id,nombre,direccion,estado,jefe_id,cant_colaboradores_normal,colaboradores_camp").in("id", ids).order("nombre"));
    if (error) throw dbError(error);
    return { ids, stores: data || [] };
  }

  async function getZonalModule(event, user, kind) {
    const { ids, stores } = await zonalScope(user);
    if (!ids.length && kind !== "personal") return kind === "asistencia" ? { fecha: todayISO(), tiendas: [] } : kind === "requerimientos" ? { tiendas: [], requerimientos: [] } : [];
    const query = event.queryStringParameters || {};
    if (kind === "personal") {
      return listUsers(user, null, { includeZonalTeam: true });
    }
    if (kind === "requerimientos") {
      const { data, error } = await readAllResult(supabase.from("requerimientos_tienda")
        .select("*,autor:usuarios!creado_por(nombres,apellidos),seguimientos:requerimiento_seguimientos(*,usuarios(nombres,apellidos))")
        .in("tienda_id", ids).order("created_at", { ascending: false }).order("id", { ascending: false }));
      if (error) throw dbError(error);
      return { tiendas: stores, requerimientos: (data || []).map(row => ({ ...row, tienda_nombre: stores.find(store => Number(store.id) === Number(row.tienda_id))?.nombre || "Tienda sin nombre" })) };
    }
    if (kind === "asistencia") {
      const fecha = query.fecha && isISODate(query.fecha) ? query.fecha : todayISO();
      const [{ data: people, error: peopleError }, { data: attendance, error: attendanceError }] = await Promise.all([
        supabase.from("usuarios").select("id,tienda_id,fecha_ingreso,fecha_salida").in("tienda_id", ids).in("rol", attendanceStaffRoles).lte("fecha_ingreso", fecha).or(`fecha_salida.is.null,fecha_salida.gte.${fecha}`),
        supabase.from("asistencias").select("tienda_id,usuario_id,estado,created_at").in("tienda_id", ids).eq("fecha", fecha),
      ].map(request => readAllResult(request)));
      if (peopleError) throw dbError(peopleError); if (attendanceError) throw dbError(attendanceError);
      return { fecha, tiendas: stores.map((store) => {
        const staff = people.filter((person) => Number(person.tienda_id) === Number(store.id));
        const rows = attendance.filter((row) => Number(row.tienda_id) === Number(store.id));
        const latest = rows.map((row) => row.created_at).filter(Boolean).sort().at(-1) || null;
        return { ...store, personal: staff.length, registrados: rows.length, faltas: rows.filter((row) => row.estado === "falta").length, tardanzas: rows.filter((row) => row.estado === "tardanza").length, pendientes: staff.filter(person => !rows.some(row => row.usuario_id === person.id)).length, ultimo_envio: latest };
      }) };
    }
    if (kind === "incidencias") {
      let request = supabase.from("incidencias_zonales").select("*,origen:tiendas!incidencias_zonales_tienda_origen_id_fkey(nombre),afectada:tiendas!incidencias_zonales_tienda_afectada_id_fkey(nombre)").order("fecha", { ascending: false });
      if (user.rol === "jefe_zonal") request = request.eq("jefe_zonal_id", user.id);
      const { data, error } = await readAllResult(request);
      if (error) throw dbError(error); return data;
    }
    if (kind === "tareas") {
      const { data, error } = await readAllResult(supabase.from("tareas_zonales").select("*,tiendas(nombre)").eq("jefe_zonal_id", user.id).in("tienda_id", ids).order("fecha_limite"));
      if (error) throw dbError(error); return data;
    }
    if (kind === "supervisiones") {
      let visitsRequest = supabase.from("visitas_zonales").select("*,tiendas(nombre,jefe:usuarios!tiendas_jefe_fk(nombres,apellidos))").in("tienda_id", ids).order("fecha", { ascending: false });
      if (user.rol === "jefe_zonal") visitsRequest = visitsRequest.eq("jefe_zonal_id", user.id);
      const [{ data: visitas, error: visitError }, { data: observaciones, error: observationError }] = await Promise.all([
        visitsRequest,
        supabase.from("observaciones_zonales").select("*,tiendas(nombre)").in("tienda_id", ids).order("created_at", { ascending: false }),
      ].map(request => readAllResult(request)));
      if (visitError) throw dbError(visitError); if (observationError) throw dbError(observationError);
      return { visitas: (visitas || []).map(serializeVisit), observaciones: observaciones || [] };
    }
    throw httpError("Módulo zonal no válido.", 404);
  }

  async function trackZonalRequirement(event, user, id) {
    if (!["jefe_zonal", "gerencia_general"].includes(user.rol)) throw httpError("No tienes acceso.", 403);
    const input = bodyOf(event);
    const comentario = cleanText(input.comentario);
    if (!Number.isSafeInteger(id) || id < 1 || !["pendiente", "en_proceso", "atendido", "cancelado"].includes(input.estado)
      || !comentario || comentario.length > 4000) throw httpError("Indica un estado válido y un comentario de hasta 4000 caracteres.", 400);
    const { ids } = await zonalScope(user);
    if (!ids.length) throw httpError("No tienes acceso a este requerimiento.", 403);
    const existing = await supabase.from("requerimientos_tienda").select("id,tienda_id,estado,updated_at").eq("id", id).in("tienda_id", ids).maybeSingle();
    if (existing.error) throw dbError(existing.error);
    const previous = existing.data;
    if (!previous) throw httpError("No tienes acceso a este requerimiento.", 403);
    if (input.estado_anterior !== previous.estado || input.version !== previous.updated_at) throw httpError("El requerimiento cambió. Actualiza la lista antes de guardar.", 409);
    const stamp = new Date().toISOString();
    const guard = query => previous.updated_at == null ? query.is("updated_at", null) : query.eq("updated_at", previous.updated_at);
    const update = await guard(supabase.from("requerimientos_tienda").update({ estado: input.estado, updated_at: stamp }).eq("id", id).eq("tienda_id", previous.tienda_id).eq("estado", previous.estado)).select("*").maybeSingle();
    if (update.error) throw dbError(update.error);
    if (!update.data) throw httpError("El requerimiento cambió. Actualiza la lista antes de guardar.", 409);
    const tracking = await supabase.from("requerimiento_seguimientos").insert({ requerimiento_id: id, usuario_id: user.id, comentario, estado: input.estado }).select("*,usuarios(nombres,apellidos)").single();
    if (tracking.error) {
      const rollback = await supabase.from("requerimientos_tienda").update({ estado: previous.estado, updated_at: previous.updated_at }).eq("id", id).eq("tienda_id", previous.tienda_id).eq("updated_at", stamp).select("id").maybeSingle();
      if (rollback.error || !rollback.data) throw httpError("No se pudo guardar el seguimiento ni restablecer el estado. Actualiza y verifica el requerimiento antes de reintentar.", 500);
      throw dbError(tracking.error);
    }
    return { requerimiento: update.data, seguimiento: tracking.data };
  }

  async function signedZonalRequirementFile(event, user) {
    const input = bodyOf(event);
    if (!Number.isSafeInteger(Number(input.requerimiento_id)) || Number(input.requerimiento_id) < 1
      || input.seguimiento_id != null && (!Number.isSafeInteger(Number(input.seguimiento_id)) || Number(input.seguimiento_id) < 1)) throw httpError("El requerimiento o seguimiento no es válido.", 400);
    const { ids } = await zonalScope(user);
    if (!ids.length) throw httpError("No tienes acceso a este requerimiento.", 403);
    const { data: requirement, error } = await supabase.from("requerimientos_tienda").select("id,tienda_id,evidencia_path")
      .eq("id", Number(input.requerimiento_id)).in("tienda_id", ids).maybeSingle();
    if (error) throw dbError(error);
    if (!requirement) throw httpError("No tienes acceso a este requerimiento.", 403);
    let path = requirement.evidencia_path;
    if (input.seguimiento_id) {
      const { data: entry, error: entryError } = await supabase.from("requerimiento_seguimientos").select("evidencia_path")
        .eq("id", Number(input.seguimiento_id)).eq("requerimiento_id", requirement.id).maybeSingle();
      if (entryError) throw dbError(entryError);
      path = entry?.evidencia_path;
    }
    if (!path || !path.startsWith(`${requirement.tienda_id}/`)) throw httpError("La evidencia no está disponible.", 404);
    const signed = await supabase.storage.from("mi-tienda").createSignedUrl(path, 300);
    if (signed.error) throw dbError(signed.error);
    return { url: signed.data.signedUrl };
  }

  async function createZonalSupervision(event, user) {
    const data = bodyOf(event);
    requireFields(data, ["tienda_id", "fecha", "periodo", "items"]);
    const storeId = Number(data.tienda_id);
    const storeIds = await zonalStoreIds(user.id);
    if (!storeIds.includes(storeId)) throw httpError("La tienda no pertenece a tu zona.", 403);
    if (!isISODate(data.fecha) || data.fecha > todayISO()) throw httpError("La fecha de auditoría no es válida.", 400);
    if (!["primera_quincena", "segunda_quincena", "extraordinaria"].includes(data.periodo)) throw httpError("El periodo de auditoría no es válido.", 400);
    if (!Array.isArray(data.items) || data.items.length !== auditItemIds.size) throw httpError(`Completa los ${auditItemIds.size} criterios del checklist.`, 400);

    const seen = new Set();
    const items = data.items.map((entry) => {
      const id = cleanText(entry.id);
      const sectionId = cleanText(entry.sectionId);
      const score = Number(entry.score);
      if (!auditItemIds.has(id) || seen.has(id)) throw httpError("El checklist contiene criterios inválidos o repetidos.", 400);
      if (!auditSectionIds.includes(sectionId) || !Number.isInteger(score) || score < 1 || score > 5) throw httpError(`Revisa la calificación del criterio ${id}.`, 400);
      seen.add(id);
      const text = cleanText(entry.text);
      const note = cleanText(entry.note);
      const action = cleanText(entry.action);
      const priority = cleanText(entry.priority) || "media";
      const deadline = cleanText(entry.deadline);
      if (!text || text.length > 700 || note.length > 1200 || action.length > 1200) throw httpError(`Revisa el contenido del criterio ${id}.`, 400);
      if (!["baja", "media", "alta", "urgente"].includes(priority)) throw httpError(`La prioridad del criterio ${id} no es válida.`, 400);
      if (score <= 3 && (!note || !action || !isISODate(deadline) || deadline < data.fecha)) throw httpError(`Completa el hallazgo, la acción y el plazo del criterio ${id}.`, 400);
      return {
        id, sectionId, section: cleanText(entry.section).slice(0, 120), text,
        period: cleanText(entry.period).slice(0, 80), score, note, action, priority,
        deadline: score <= 3 ? deadline : null,
      };
    });
    if (seen.size !== auditItemIds.size || auditSectionIds.some((sectionId) => !items.some((item) => item.sectionId === sectionId))) throw httpError("El checklist está incompleto.", 400);

    const sections = auditSectionIds.map((sectionId) => {
      const entries = items.filter((item) => item.sectionId === sectionId);
      return {
        id: sectionId,
        title: entries[0]?.section || sectionId,
        percent: Math.round((entries.reduce((sum, item) => sum + item.score, 0) / (entries.length * 5)) * 100),
      };
    });
    const score = Math.round(sections.reduce((sum, section) => sum + section.percent, 0) / sections.length);
    const generalNote = cleanText(data.generalNote).slice(0, 1500);
    const detail = { version: 1, generalNote, sections, items };
    const created = await supabase.from("visitas_zonales").insert({
      tienda_id: storeId,
      jefe_zonal_id: user.id,
      fecha: data.fecha,
      periodo: data.periodo,
      puntaje: score,
      checklist_nombre: "Checklist digital de auditoría de tienda",
      observacion_general: `${auditPayloadPrefix}${JSON.stringify(detail)}`,
    }).select("id").single();
    if (created.error) throw dbError(created.error);

    const findings = items.filter((item) => item.score <= 3).map((item) => ({
      visita_id: created.data.id,
      tienda_id: storeId,
      area_item: `${item.section} · ${item.id}`,
      prioridad: item.priority,
      fecha_limite: item.deadline,
      descripcion: `${item.text}\n\nHallazgo: ${item.note}`,
      accion_solicitada: item.action,
      estado: "abierta",
    }));
    if (findings.length) {
      const observations = await supabase.from("observaciones_zonales").insert(findings);
      if (observations.error) {
        await supabase.from("visitas_zonales").delete().eq("id", created.data.id);
        throw dbError(observations.error);
      }
    }
    return { id: created.data.id, puntaje: score, observaciones: findings.length };
  }

  async function getZonalComparison(event, user) {
    const { ids, stores } = await zonalScope(user);
    const query = event.queryStringParameters || {};
    const fecha = isISODate(query.fecha) ? query.fecha : formatLimaDate(new Date()).split("/").reverse().join("-");
    const desde = isISODate(query.desde) ? query.desde : fecha;
    const hasta = isISODate(query.hasta) ? query.hasta : fecha;
    if (desde > hasta || desde.slice(0, 7) !== hasta.slice(0, 7) || hasta > fecha) throw httpError("Selecciona un periodo valido dentro del mes y hasta hoy.", 400);
    if (!ids.length) return { fecha, desde, hasta, tiendas: [] };
    const alertWindow = new Date(`${fecha}T12:00:00Z`);
    alertWindow.setUTCDate(alertWindow.getUTCDate() + 365);
    const deadline = alertWindow.toISOString().slice(0, 10);
    const [people, attendance, traffic, incidents, errors, documents] = await Promise.all([
      fetchAllReportPages(supabase.from("usuarios").select("id,tienda_id,rol,fecha_ingreso,fecha_salida,periodos_laborales!periodos_laborales_usuario_id_fkey(fecha_ingreso,fecha_salida)").in("tienda_id", ids).in("rol", storeStaffRoles).order("id")),
      fetchAllReportPages(supabase.from("asistencias").select("id,tienda_id,usuario_id,fecha,estado").in("tienda_id", ids).gte("fecha", desde).lte("fecha", hasta).order("id")),
      fetchAllReportPages(supabase.from("trafico_tienda").select("id,tienda_id,cantidad").in("tienda_id", ids).gte("fecha", desde).lte("fecha", hasta).order("id")),
      fetchAllReportPages(supabase.from("incidencias").select("id,tienda_id,tipo,asunto").in("tienda_id", ids).gte("fecha", `${desde}T00:00:00-05:00`).lte("fecha", `${hasta}T23:59:59.999-05:00`).order("id")),
      fetchAllReportPages(supabase.from("errores_personal").select("id,tienda_id").in("tienda_id", ids).gte("fecha", desde).lte("fecha", hasta).order("id")),
      fetchAllReportPages(supabase.from("documentos_municipales").select("id,tienda_id,fecha_vencimiento,dias_alerta").in("tienda_id", ids).gte("fecha_vencimiento", fecha).lte("fecha_vencimiento", deadline).order("id")),
    ]);
    return { fecha, desde, hasta, tiendas: stores.map((store) => {
      const staff = people.filter(person => Number(person.tienda_id) === Number(store.id));
      const marks = attendance.filter(row => Number(row.tienda_id) === Number(store.id));
      const headcount = staff.filter(person => employmentPeriods(person).some(period => period.fecha_ingreso <= hasta && (!period.fecha_salida || period.fecha_salida >= hasta))).length;
      const campaign = ["02", "07", "12"].includes(hasta.slice(5, 7));
      const target = Number(campaign ? store.colaboradores_camp || store.cant_colaboradores_normal : store.cant_colaboradores_normal) || null;
      const storeIncidents = incidents.filter((row) => Number(row.tienda_id) === Number(store.id));
      return {
        id: store.id, nombre: store.nombre, personal: headcount,
        meta_personal: target, brecha_personal: target === null ? null : headcount - target, meta_campana: campaign,
        presentes: marks.filter((row) => row.estado === "presente").length,
        tardanzas: marks.filter((row) => row.estado === "tardanza").length,
        faltas: marks.filter((row) => row.estado === "falta").length,
        asistentes: marks.filter((row) => presenteEstados.has(row.estado)).length,
        marcas: new Set(marks.map((row) => `${row.usuario_id}|${row.fecha}`)).size,
        otros: marks.filter((row) => !["presente", "tardanza", "falta"].includes(row.estado)).length,
        pendientes: pendingAttendance(staff.filter(person => attendanceStaffRoles.includes(person.rol)), marks, desde, hasta),
        conteos_trafico: traffic.filter((row) => Number(row.tienda_id) === Number(store.id)).length,
        visitas: traffic.filter((row) => Number(row.tienda_id) === Number(store.id)).reduce((sum, row) => sum + Number(row.cantidad || 0), 0),
        incidencias_seguridad: storeIncidents.filter(isSecurityIncident).length,
        incidencias_administrativas: storeIncidents.filter((row) => !isSecurityIncident(row)).length,
        errores: errors.filter((row) => Number(row.tienda_id) === Number(store.id)).length,
        documentos_por_vencer: documents.filter((row) => Number(row.tienda_id) === Number(store.id) && Math.round((Date.parse(`${row.fecha_vencimiento}T12:00:00Z`) - Date.parse(`${fecha}T12:00:00Z`)) / 86400000) <= Number(row.dias_alerta || 30)).length,
      };
    }) };
  }

  async function getGeneralComparison(event, user) {
    const [comparison, stores, clusters] = await Promise.all([getZonalComparison(event, user), listTiendas(user), listClusters()]);
    const activeStores = stores.filter((store) => store.estado === "activo");
    const activeIds = new Set(activeStores.map((store) => Number(store.id)));
    const storeDetails = new Map(activeStores.map((store) => [Number(store.id), store]));
    const rows = comparison.tiendas.filter((store) => activeIds.has(Number(store.id))).map((store) => {
      const detail = storeDetails.get(Number(store.id));
      return { ...store, cluster_id: detail.cluster_id || null, cluster_nombre: detail.cluster_nombre || "Sin clúster" };
    });
    const clusterNames = new Map(clusters.map((cluster) => [Number(cluster.id), cluster.nombre]));
    const groups = new Map();
    for (const store of rows) {
      const key = Number(store.cluster_id) || 0;
      if (!groups.has(key)) groups.set(key, { id: key, nombre: clusterNames.get(key) || "Sin clúster", tiendas: 0, personal: 0, asistentes: 0, tardanzas: 0, faltas: 0, pendientes: 0, marcas: 0, conteos_trafico: 0, visitas: 0, incidencias: 0, errores: 0 });
      const group = groups.get(key);
      group.tiendas += 1;
      for (const field of ["personal", "asistentes", "tardanzas", "faltas", "pendientes", "marcas", "conteos_trafico", "visitas", "errores"]) group[field] += store[field] || 0;
      group.incidencias += store.incidencias_administrativas + store.incidencias_seguridad;
    }
    return { desde: comparison.desde, hasta: comparison.hasta, tiendas: rows, clusters: [...groups.values()].sort((a, b) => b.visitas - a.visitas || a.nombre.localeCompare(b.nombre, "es")) };
  }

  async function getZonalCluster(user) {
    const { data, error } = await supabase.from("clusters").select("id,nombre,codigo,estado").eq("jefe_zonal_id", user.id).maybeSingle();
    if (error) throw dbError(error); if (!data) throw httpError("No tienes un clúster asignado.", 404); return data;
  }

  async function signedZonalSupervisionFile(event, user) {
    const { path, visita_id: visitId } = bodyOf(event); const ids = await zonalStoreIds(user.id);
    const { data: visit, error: visitError } = await supabase.from("visitas_zonales").select("id,tienda_id,checklist_path").eq("id",Number(visitId)).in("tienda_id",ids).maybeSingle();
    if (visitError) throw dbError(visitError); if (!visit || visit.checklist_path !== path) throw httpError("No tienes acceso a este checklist.",403);
    const { data, error } = await supabase.storage.from("mi-tienda").createSignedUrl(path,300); if(error)throw dbError(error); return {url:data.signedUrl};
  }

  async function exportZonalSupervisions(user) {
    const result=await getZonalModule({},user,"supervisiones"); const workbook=await createExcelWorkbook(); const sheet=workbook.addWorksheet("Supervisiones");
    sheet.columns=[{header:"Código",key:"codigo",width:14},{header:"Tienda",key:"tienda",width:22},{header:"Administrador",key:"administrador",width:25},{header:"Fecha",key:"fecha",width:14},{header:"Periodo",key:"periodo",width:18},{header:"Puntaje",key:"puntaje",width:12},{header:"Observaciones",key:"observaciones",width:16},{header:"Por validar",key:"por_validar",width:14},{header:"Estado",key:"estado",width:18}];
    sheet.addRows(result.visitas.map(visit=>{const observations=result.observaciones.filter(item=>item.visita_id===visit.id);const chief=visit.tiendas?.jefe;return{codigo:`SUP-${String(visit.id).padStart(4,"0")}`,tienda:visit.tiendas?.nombre||"",administrador:chief?`${chief.nombres} ${chief.apellidos}`:"Sin asignar",fecha:visit.fecha,periodo:visit.periodo||"",puntaje:visit.puntaje??"",observaciones:observations.length,por_validar:observations.filter(item=>item.estado==="en_validacion").length,estado:observations.some(item=>item.estado==="en_validacion")?"Por validar":observations.some(item=>item.estado!=="levantada")?"En seguimiento":"Cerrada"};})); styleHeader(sheet); return excelResponse(workbook,"supervisiones-zonales.xlsx");
  }

  async function createZonalIncident(event, user) {
    const data = bodyOf(event);
    requireFields(data, ["tipo", "alcance", "fecha", "descripcion", "estado"]);
    const types = ["diferencia_transferencia","coordinacion_tiendas","apoyo_tiendas","logistica_externa","proveedor","infraestructura_externa","otro"];
    const scopes = ["entre_tiendas","externa_tienda","varias_tiendas"];
    const states = ["abierta","en_seguimiento","cerrada"];
    if (!types.includes(data.tipo) || !scopes.includes(data.alcance) || !states.includes(data.estado) || !isISODate(data.fecha)) throw httpError("Revisa el tipo, alcance, fecha y estado.", 400);
    const ids = await zonalStoreIds(user.id); const originId = data.tienda_origen_id ? Number(data.tienda_origen_id) : null; const affectedId = data.tienda_afectada_id ? Number(data.tienda_afectada_id) : null;
    if (!originId && !affectedId) throw httpError("Selecciona al menos una tienda relacionada.", 400);
    if ([originId, affectedId].filter(Boolean).some((id) => !ids.includes(id))) throw httpError("Una de las tiendas no pertenece a tu zona.", 403);
    let evidencePath = null; let evidenceName = null;
    if (data.evidencia_base64) {
      const allowed = ["application/pdf","image/jpeg","image/png","image/webp"];
      if (!allowed.includes(data.evidencia_mime)) throw httpError("La evidencia debe ser PDF, JPG, PNG o WEBP.", 400);
      const buffer = Buffer.from(String(data.evidencia_base64).replace(/^data:[^;]+;base64,/, ""), "base64");
      if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw httpError("La evidencia debe pesar como máximo 5 MB.", 400);
      evidenceName = cleanText(data.evidencia_nombre).replace(/[^a-z0-9._-]/gi, "-"); evidencePath = `zonal-${user.id}/incidencias/${Date.now()}-${evidenceName}`;
      const uploaded = await supabase.storage.from("mi-tienda").upload(evidencePath, buffer, { contentType: data.evidencia_mime, upsert: false }); if (uploaded.error) throw dbError(uploaded.error);
    }
    const { data: row, error } = await supabase.from("incidencias_zonales").insert({ jefe_zonal_id:user.id, tipo:data.tipo, alcance:data.alcance, tienda_origen_id:originId, tienda_afectada_id:affectedId, fecha:data.fecha, descripcion:cleanText(data.descripcion), estado:data.estado, responsable_seguimiento:`${user.nombres || "Jefe"} ${user.apellidos || "Zonal"}`.trim(), evidencia_path:evidencePath, evidencia_nombre:evidenceName }).select().single();
    if (error) throw dbError(error); return row;
  }

  async function updateZonalIncident(event, user, id) {
    const { estado } = bodyOf(event); if (!["abierta","en_seguimiento","cerrada"].includes(estado)) throw httpError("El estado no es válido.", 400);
    const { data, error } = await supabase.from("incidencias_zonales").update({ estado, updated_at:new Date().toISOString() }).eq("id",id).eq("jefe_zonal_id",user.id).select().maybeSingle();
    if (error) throw dbError(error); if (!data) throw httpError("Incidencia no encontrada.",404); return data;
  }

  async function exportZonalIncidents(user) {
    const rows = await getZonalModule({}, user, "incidencias"); const workbook = await createExcelWorkbook(); const sheet = workbook.addWorksheet("Incidencias zonales");
    sheet.columns = [{header:"Código",key:"codigo",width:14},{header:"Fecha",key:"fecha",width:14},{header:"Tipo",key:"tipo",width:24},{header:"Alcance",key:"alcance",width:20},{header:"Tienda origen",key:"origen",width:22},{header:"Tienda afectada",key:"afectada",width:22},{header:"Estado",key:"estado",width:18},{header:"Descripción",key:"descripcion",width:45},{header:"Responsable",key:"responsable",width:24}];
    sheet.addRows(rows.map((row)=>({codigo:`IZ-${String(row.id).padStart(4,"0")}`,fecha:row.fecha,tipo:row.tipo.replaceAll("_"," "),alcance:row.alcance.replaceAll("_"," "),origen:row.origen?.nombre||"",afectada:row.afectada?.nombre||"",estado:row.estado.replaceAll("_"," "),descripcion:row.descripcion,responsable:row.responsable_seguimiento}))); styleHeader(sheet);
    return excelResponse(workbook, "incidencias-zonales.xlsx");
  }

  return { serializeVisit, getZonalModule, trackZonalRequirement, signedZonalRequirementFile, createZonalSupervision, getZonalComparison, getGeneralComparison, getZonalCluster, signedZonalSupervisionFile, exportZonalSupervisions, createZonalIncident, updateZonalIncident, exportZonalIncidents };
}
