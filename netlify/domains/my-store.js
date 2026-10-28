export function createMyStoreDomain({
  bodyOf, cleanText, dbError, disabledPassword, ensureUniqueUser,
  httpError, isISODate, readAllResult, requireFields, serializeVisit,
  supabase, todayISO, zonalStoreIds,
}) {
  const miTiendaTables = {
    documentos: "documentos_municipales",
    reclamaciones: "reclamaciones_tienda",
    acciones: "acciones_tienda",
    requerimientos: "requerimientos_tienda",
  };

  async function getMiTienda(user) {
    const storeId = user.tienda_id;
    const [store, documentos, reclamaciones, acciones, requerimientos, seguimientos, visitas, observaciones, apoyos] = await Promise.all([
      supabase.from("tiendas").select("id,nombre,formato,distrito,direccion,metraje_m2,capacidad_stock_unid,capacidad_stock_calzado_unid,capacidad_stock_textil_unid").eq("id", storeId).single(),
      supabase.from("documentos_municipales").select("*").eq("tienda_id", storeId).order("fecha_vencimiento"),
      supabase.from("reclamaciones_tienda").select("*").eq("tienda_id", storeId).order("fecha", { ascending: false }),
      supabase.from("acciones_tienda").select("*").eq("tienda_id", storeId).order("fecha"),
      supabase.from("requerimientos_tienda").select("*").eq("tienda_id", storeId).order("created_at", { ascending: false }),
      supabase.from("requerimiento_seguimientos").select("*,requerimientos_tienda!inner(tienda_id),usuarios(nombres,apellidos)").eq("requerimientos_tienda.tienda_id", storeId).order("created_at", { ascending: false }),
      supabase.from("visitas_zonales").select("*,usuarios(nombres,apellidos)").eq("tienda_id", storeId).order("fecha", { ascending: false }),
      supabase.from("observaciones_zonales").select("*").eq("tienda_id", storeId).order("created_at", { ascending: false }),
      supabase.from("apoyos_seguridad").select("*,usuarios!apoyos_seguridad_usuario_id_fkey(nombres,apellidos,telefono,estado)").eq("tienda_id", storeId).order("created_at", { ascending: false }),
    ].map((request, index) => index === 0 ? request : readAllResult(request)));
    for (const result of [store, documentos, reclamaciones, acciones, requerimientos, seguimientos, visitas, observaciones, apoyos]) if (result.error) throw dbError(result.error);
    const today = todayISO();
    const docs = documentos.data || [], claims = reclamaciones.data || [], acts = acciones.data || [];
    return {
      tienda: store.data,
      documentos: docs, reclamaciones: claims, acciones: acts, requerimientos: (requerimientos.data || []).map((item) => ({ ...item, seguimientos: (seguimientos.data || []).filter((entry) => entry.requerimiento_id === item.id) })),
      visitas: (visitas.data || []).map(serializeVisit), observaciones: observaciones.data || [], apoyos_seguridad: apoyos.data || [],
      resumen: {
        documentos_por_vencer: docs.filter((x) => x.fecha_vencimiento && x.fecha_vencimiento >= today && Math.round((Date.parse(`${x.fecha_vencimiento}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000) <= Number(x.dias_alerta || 30)).length,
        reclamos_en_atencion: claims.filter((x) => ["registrado", "en_atencion"].includes(x.estado)).length,
        observaciones_abiertas: (observaciones.data || []).filter((x) => !["levantada"].includes(x.estado)).length,
        proxima_accion: acts.find((x) => x.fecha >= today && !["completada", "cancelada"].includes(x.estado)) || null,
      },
    };
  }

  async function updateMiTiendaData(event, user) {
    const data = bodyOf(event);
    const editable = ["nombre", "formato", "distrito", "direccion", "metraje_m2", "capacidad_stock_unid", "capacidad_stock_calzado_unid", "capacidad_stock_textil_unid"];
    if (Object.keys(data).some(key => !editable.includes(key))) throw httpError("Ese campo de tienda no se puede editar desde este módulo.", 403);
    const payload = {};
    for (const [key, max] of [["nombre", 120], ["distrito", 80], ["direccion", 180]]) {
      if (data[key] === undefined) continue;
      const value = cleanText(data[key]);
      if (value.length < (key === "nombre" || key === "distrito" ? 2 : 3) || value.length > max) throw httpError(`El campo ${key} no es válido.`, 400);
      payload[key] = value;
    }
    if (data.formato !== undefined) {
      if (!["PROPIA", "METRO"].includes(data.formato)) throw httpError("El formato no es válido.", 400);
      payload.formato = data.formato;
    }
    for (const key of ["metraje_m2", "capacidad_stock_unid", "capacidad_stock_calzado_unid", "capacidad_stock_textil_unid"]) {
      if (data[key] === undefined) continue;
      const value = Number(data[key]);
      if (data[key] === "" || data[key] == null || !Number.isFinite(value) || value < 0
        || (key !== "metraje_m2" && !Number.isInteger(value))) throw httpError(`El valor de ${key === "metraje_m2" ? "metros cuadrados" : "capacidad"} no es válido.`, 400);
      payload[key] = value;
    }
    if (!Object.keys(payload).length) throw httpError("No hay datos para actualizar.", 400);
    const { error } = await supabase.from("tiendas").update(payload).eq("id", user.tienda_id);
    if (error) throw dbError(error);
  }

  async function saveMiTiendaRecord(event, user, kind, id = null) {
    const table = miTiendaTables[kind];
    if (!table) throw httpError("Tipo de registro no válido.", 400);
    const data = bodyOf(event);
    const allowed = {
      documentos: ["area_responsable","responsables","codigo","tipo_documento","frecuencia_revision","fecha_emision","fecha_vencimiento","estado","dias_alerta","archivo_path","archivo_nombre"],
      reclamaciones: ["codigo_hoja","fecha","consumidor_nombre","consumidor_documento","consumidor_contacto","producto_servicio","monto","tipo","detalle","pedido_consumidor","observaciones_proveedor","acciones_adoptadas","fecha_respuesta","responsable","estado","archivo_path","archivo_nombre"],
      acciones: ["fecha","tipo","responsable","accion","estado","objetivo","observacion","evidencia_path","evidencia_nombre"],
      requerimientos: ["requerimiento","cantidad","areas_responsables","urgencia","fecha_inicio","fecha_fin_objetivo","estado","evidencia_path","evidencia_nombre","comentario"],
    }[kind];
    const required = { documentos: ["responsables","tipo_documento"], reclamaciones: ["codigo_hoja","fecha","consumidor_nombre","producto_servicio","tipo","detalle"], acciones: ["fecha","tipo","responsable","accion"], requerimientos: ["requerimiento","areas_responsables","urgencia","fecha_inicio"] }[kind];
    const isDocumentAlertUpdate = kind === "documentos" && id && Object.keys(data).every((key) => key === "dias_alerta");
    if (!isDocumentAlertUpdate) requireFields(data, required);
    if (kind === "reclamaciones" && data.estado !== undefined && !["registrado", "en_atencion", "respondido", "cerrado"].includes(data.estado)) throw httpError("El estado de la reclamación no es válido.", 400);
    if (kind === "requerimientos" && (!Array.isArray(data.areas_responsables) || !data.areas_responsables.length)) throw httpError("Selecciona al menos un área responsable.", 400);
    if (kind === "documentos" && !isDocumentAlertUpdate && (!Array.isArray(data.responsables) || !data.responsables.length)) throw httpError("Selecciona al menos un responsable.", 400);
    if (kind === "documentos" && data.dias_alerta !== undefined && (!Number.isInteger(Number(data.dias_alerta)) || Number(data.dias_alerta) < 1 || Number(data.dias_alerta) > 365)) throw httpError("Los días de alerta deben estar entre 1 y 365.", 400);
    const payload = Object.fromEntries(allowed.filter((key) => data[key] !== undefined).map((key) => [key, typeof data[key] === "string" ? cleanText(data[key]) || null : data[key]]));
    if (kind === "documentos" && Array.isArray(data.responsables)) payload.area_responsable = data.responsables.join(", ");
    payload.updated_at = new Date().toISOString();
    let query;
    if (id) query = supabase.from(table).update(payload).eq("id", id).eq("tienda_id", user.tienda_id);
    else query = supabase.from(table).insert({ ...payload, tienda_id: user.tienda_id, creado_por: user.id });
    const { data: row, error } = await query.select().single();
    if (error) throw dbError(error);
    if (kind === "requerimientos" && !id) {
      const tracking = await supabase.from("requerimiento_seguimientos").insert({ requerimiento_id: row.id, usuario_id: user.id, comentario: "Requerimiento registrado", estado: row.estado });
      if (tracking.error) throw dbError(tracking.error);
    }
    return row;
  }

  async function createSecuritySupport(event, user) {
    const data = bodyOf(event);
    requireFields(data, ["nombres", "apellidos", "dni", "fecha_inicio", "fecha_fin", "foto_referencia_path"]);
    const dni = cleanText(data.dni);
    if (!/^\d{8}$/.test(dni)) throw httpError("El DNI debe tener 8 dígitos.", 400);
    if (!isISODate(data.fecha_inicio) || !isISODate(data.fecha_fin) || data.fecha_fin < data.fecha_inicio) throw httpError("Indica un periodo de apoyo válido.", 400);
    await ensureUniqueUser(null, dni);
    const username = `apoyo.${dni}.${Date.now().toString(36)}`;
    const inserted = await supabase.from("usuarios").insert({ nombres: cleanText(data.nombres), apellidos: cleanText(data.apellidos), dni, tipo_documento: "dni", usuario: username, password: disabledPassword, telefono: cleanText(data.telefono) || null, rol: "seguridad", tienda_id: user.tienda_id, estado: "activo", fecha_ingreso: data.fecha_inicio }).select("id").single();
    if (inserted.error) throw dbError(inserted.error);
    const support = await supabase.from("apoyos_seguridad").insert({ usuario_id: inserted.data.id, tienda_id: user.tienda_id, dni, foto_referencia_path: data.foto_referencia_path, fecha_inicio: data.fecha_inicio, fecha_fin: data.fecha_fin, motivo: cleanText(data.motivo) || null, creado_por: user.id }).select("*").single();
    if (support.error) { await supabase.from("usuarios").delete().eq("id", inserted.data.id); throw dbError(support.error); }
    return support.data;
  }

  async function updateSecuritySupport(event, user, id) {
    const data = bodyOf(event); const payload = {};
    if (data.activo !== undefined) payload.activo = Boolean(data.activo);
    if (data.fecha_fin !== undefined) { if (!isISODate(data.fecha_fin)) throw httpError("La fecha final no es válida.", 400); payload.fecha_fin = data.fecha_fin; }
    payload.updated_at = new Date().toISOString();
    const result = await supabase.from("apoyos_seguridad").update(payload).eq("id", id).eq("tienda_id", user.tienda_id).select("*").maybeSingle();
    if (result.error) throw dbError(result.error); if (!result.data) throw httpError("El apoyo no existe.", 404);
    const status = await supabase.from("usuarios").update({ estado: result.data.activo ? "activo" : "inactivo", fecha_salida: result.data.activo ? null : todayISO() }).eq("id", result.data.usuario_id);
    if (status.error) throw dbError(status.error);
    return result.data;
  }

  async function addRequirementTracking(event, user, id) {
    const data = bodyOf(event);
    requireFields(data, ["comentario", "estado"]);
    const existing = await supabase.from("requerimientos_tienda").select("id").eq("id", id).eq("tienda_id", user.tienda_id).maybeSingle();
    if (existing.error) throw dbError(existing.error);
    if (!existing.data) throw httpError("El requerimiento no existe.", 404);
    const estado = ["pendiente", "en_proceso", "atendido", "cancelado"].includes(data.estado) ? data.estado : "pendiente";
    const update = await supabase.from("requerimientos_tienda").update({ estado, updated_at: new Date().toISOString() }).eq("id", id);
    if (update.error) throw dbError(update.error);
    const { data: row, error } = await supabase.from("requerimiento_seguimientos").insert({ requerimiento_id: id, usuario_id: user.id, comentario: cleanText(data.comentario), estado, evidencia_path: data.evidencia_path || null, evidencia_nombre: data.evidencia_nombre || null }).select().single();
    if (error) throw dbError(error);
    return row;
  }

  async function updateZonalObservation(event, user, id) {
    const data = bodyOf(event);
    requireFields(data, ["accion_realizada"]);
    const existing = await supabase.from("observaciones_zonales").select("id,estado").eq("id", id).eq("tienda_id", user.tienda_id).maybeSingle();
    if (existing.error) throw dbError(existing.error);
    if (!existing.data) throw httpError("La observación no existe.", 404);
    if (!["abierta", "en_proceso", "rechazada"].includes(existing.data.estado)) throw httpError("Esta observación no admite un nuevo levantamiento en su estado actual.", 409);
    const payload = {
      accion_realizada: cleanText(data.accion_realizada), comentario: cleanText(data.comentario) || null,
      soporte_requerido: Boolean(data.soporte_requerido), evidencia_cierre_path: data.evidencia_cierre_path || null,
      evidencia_cierre_nombre: data.evidencia_cierre_nombre || null, estado: "en_validacion",
      validado_por: null, comentario_validacion: null, fecha_validacion: null, updated_at: new Date().toISOString(),
    };
    const { data: row, error } = await supabase.from("observaciones_zonales").update(payload).eq("id", id).eq("tienda_id", user.tienda_id).select().maybeSingle();
    if (error) throw dbError(error);
    if (!row) throw httpError("La observación no existe.", 404);
    return row;
  }

  async function validateZonalObservation(event, user, id) {
    const data = bodyOf(event);
    requireFields(data, ["resultado", "comentario"]);
    if (!["validar", "reabrir"].includes(data.resultado)) throw httpError("La decisión de validación no es válida.", 400);
    const comment = cleanText(data.comentario);
    if (comment.length < 3 || comment.length > 1200) throw httpError("Ingresa un comentario de validación válido.", 400);
    const ids = await zonalStoreIds(user.id);
    const existing = await supabase.from("observaciones_zonales").select("id,estado").eq("id", id).in("tienda_id", ids).maybeSingle();
    if (existing.error) throw dbError(existing.error);
    if (!existing.data) throw httpError("La observación no pertenece a tu zona.", 404);
    if (existing.data.estado !== "en_validacion") throw httpError("La observación todavía no está lista para validarse.", 409);
    const now = new Date().toISOString();
    const result = await supabase.from("observaciones_zonales").update({
      estado: data.resultado === "validar" ? "levantada" : "rechazada",
      validado_por: user.id,
      comentario_validacion: comment,
      fecha_validacion: now,
      updated_at: now,
    }).eq("id", id).in("tienda_id", ids).select().single();
    if (result.error) throw dbError(result.error);
    return result.data;
  }

  async function uploadMiTiendaFile(event, user) {
    const data = bodyOf(event);
    requireFields(data, ["nombre", "mime", "base64", "carpeta"]);
    const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(data.mime)) throw httpError("Solo se permiten PDF, JPG, PNG o WEBP.", 400);
    const buffer = Buffer.from(String(data.base64).replace(/^data:[^;]+;base64,/, ""), "base64");
    if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw httpError("El archivo debe pesar como máximo 5 MB.", 400);
    const safeFolder = cleanText(data.carpeta).replace(/[^a-z0-9_-]/gi, "-");
    const safeName = cleanText(data.nombre).replace(/[^a-z0-9._-]/gi, "-");
    const path = `${user.tienda_id}/${safeFolder}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("mi-tienda").upload(path, buffer, { contentType: data.mime, upsert: false });
    if (error) throw dbError(error);
    return { path, nombre: cleanText(data.nombre) };
  }

  async function signedMiTiendaFile(event, user) {
    const { path } = bodyOf(event);
    if (!String(path || "").startsWith(`${user.tienda_id}/`)) throw httpError("No tienes acceso a este archivo.", 403);
    const { data, error } = await supabase.storage.from("mi-tienda").createSignedUrl(path, 300);
    if (error) throw dbError(error);
    return { url: data.signedUrl };
  }

  return { getMiTienda, updateMiTiendaData, saveMiTiendaRecord, createSecuritySupport, updateSecuritySupport, addRequirementTracking, updateZonalObservation, validateZonalObservation, uploadMiTiendaFile, signedMiTiendaFile };
}
