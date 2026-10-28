export function createOperationsDomain({
  httpError, zonalStoreIds, bodyOf, supabase, isISODate, fetchAllReportPages,
  dbError, requireFields, rangosTrafico, cleanText, createExcelWorkbook,
  styleHeader, excelResponse, isSecurityIncident, createSecurityDomain,
  todayISO, csvLine, businessDate, readAllResult, storeStaffRoles, validIds,
  normalizeLaborArea, activeStoreIds, resolveStoreScope, applyStoreScope,
  commercialCompanyRanking, publishedCommercialRelease, commercialStoreGoals,
  addDays, buildStoreSalesForecast, hasStoreScope,
}) {
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
    const { desde, hasta } = event.queryStringParameters || {};
    if (desde && !isISODate(desde) || hasta && !isISODate(hasta) || desde && hasta && desde > hasta) {
      throw httpError("Selecciona un período válido.", 400);
    }
    if (desde) request = request.gte("fecha", table === "incidencias" ? `${desde}T00:00:00-05:00` : desde);
    if (hasta) request = request.lte("fecha", table === "incidencias" ? `${hasta}T23:59:59.999-05:00` : hasta);
    const data = await fetchAllReportPages(request.order(table === "documentos_tienda" ? "fecha_vencimiento" : "fecha", { ascending: false }).order("id"));
    return data;
  }

  async function listDashboardDocumentAlerts(event, user) {
    const storeId = await operationalStoreId(event, user);
    const { data, error } = await supabase
      .from("documentos_municipales")
      .select("id,tipo_documento,fecha_vencimiento,dias_alerta")
      .eq("tienda_id", storeId)
      .order("fecha_vencimiento");
    if (error) throw dbError(error);
    return data || [];
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

  async function updateTraffic(event, user, id) {
    const data = bodyOf(event);
    requireFields(data, ["fecha", "rango_hora", "cantidad"]);
    if (!rangosTrafico.has(data.rango_hora) || !isISODate(data.fecha) || !Number.isInteger(Number(data.cantidad)) || Number(data.cantidad) < 0) throw httpError("Indica una fecha, rango y cantidad válidos.", 400);
    const { data: existing, error: lookupError } = await supabase.from("trafico_tienda").select("fecha").eq("id", id).eq("tienda_id", user.tienda_id).maybeSingle();
    if (lookupError) throw dbError(lookupError);
    if (!existing) throw httpError("El registro de tráfico no existe.", 404);
    if (String(existing.fecha).slice(0, 10) !== limaDateISO()) throw httpError("Este registro ya no puede editarse porque corresponde a un día anterior.", 403);
    const { data: row, error } = await supabase.from("trafico_tienda").update({ fecha: data.fecha, rango_hora: data.rango_hora, cantidad: Number(data.cantidad), observaciones: cleanText(data.observaciones) || null, updated_at: limaTimestamp() }).eq("id", id).eq("tienda_id", user.tienda_id).select().maybeSingle();
    if (error) throw dbError(error);
    return row;
  }

  async function exportTrafficExcel(event, user) {
    const rows = await listOperational("trafico_tienda", event, user,
      "fecha,rango_hora,cantidad,observaciones,tiendas(nombre),usuarios!trafico_tienda_registrado_por_fkey(nombres,apellidos,usuario)");
    const workbook = await createExcelWorkbook();
    workbook.creator = "Asiste";
    workbook.created = new Date();

    const traffic = workbook.addWorksheet("Tráfico");
    traffic.columns = [
      { header: "Fecha", key: "fecha", width: 14 },
      { header: "Tienda", key: "tienda", width: 26 },
      { header: "Rango horario", key: "rango_hora", width: 22 },
      { header: "Visitantes", key: "cantidad", width: 14 },
      { header: "Observación", key: "observaciones", width: 48 },
      { header: "Registrado por", key: "registrado_por", width: 30 },
    ];
    traffic.addRows(rows.map((row) => ({
      fecha: row.fecha,
      tienda: row.tiendas?.nombre || "",
      rango_hora: row.rango_hora || "",
      cantidad: Number(row.cantidad || 0),
      observaciones: row.observaciones || "",
      registrado_por: row.usuarios
        ? `${row.usuarios.nombres} ${row.usuarios.apellidos} (@${row.usuarios.usuario})`
        : "",
    })));
    traffic.getColumn("observaciones").alignment = { vertical: "top", wrapText: true };
    styleHeader(traffic);
    const nowParts = limaDateParts(new Date());
    return excelResponse(workbook, `${nowParts.month}-${nowParts.day}-trafico.xlsx`);
  }

  function limaTimestamp(date = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(date).filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  }

  function limaDateISO(date = new Date()) { return limaTimestamp(new Date(date)).slice(0, 10); }

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
    if (data.fecha && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-05:00$/.test(String(data.fecha))) {
      throw httpError("La fecha y hora de la incidencia no son válidas.", 400);
    }
    if (data.fecha && Number.isNaN(new Date(data.fecha).getTime())) throw httpError("La fecha y hora de la incidencia no son válidas.", 400);
    const securityTypes = ["robo", "robo_frustrado", "robo_interno", "estafa", "asalto", "fiscalizacion", "cambio_precio", "otro"];
    const internalTypes = ["accidente", "dano_infraestructura", "problema_operativo", "falla_interna", "otro"];
    const isSecurityUser = ["seguridad", "jefe_seguridad"].includes(user.rol);
    if (isSecurityUser && !securityTypes.includes(data.tipo)) {
      throw httpError("Selecciona un tipo de incidencia válido.", 400);
    }
    if (["jefe_tienda", "asistente_tienda"].includes(user.rol) && !internalTypes.includes(data.tipo)) {
      throw httpError("Selecciona un tipo de incidencia interna válido.", 400);
    }
    if (!["baja", "media", "alta"].includes(data.gravedad)) {
      throw httpError("Selecciona una severidad válida.", 400);
    }
    const isPriceChange = data.tipo === "cambio_precio";
    const detencion = isSecurityUser && !isPriceChange ? Boolean(data.detencion) : false;
    const detencionDetalle = cleanText(data.detencion_detalle);
    if (detencion && !detencionDetalle) {
      throw httpError("Describe los detalles de la detención.", 400);
    }
    if (!["piso_venta", "textil", "calzado", "hogar", "tecnologia", "electro", "belleza", "bano", "caja", "almacen", "ingreso", "exterior", "proveedores", "otro"].includes(data.area || "otro")) {
      throw httpError("Selecciona un área o ubicación válida.", 400);
    }
    const storeId = await resolveOperationalStoreScope(user, data.tienda_id);
    const incidentNames = { robo: "Robo", robo_frustrado: "Robo frustrado", robo_interno: "Robo interno", estafa: "Estafa", asalto: "Asalto", fiscalizacion: "Fiscalización", cambio_precio: "Cambio de precio", accidente: "Accidente", dano_infraestructura: "Daño de infraestructura", problema_operativo: "Problema operativo", falla_interna: "Falla interna", otro: isSecurityUser ? "Otra incidencia de seguridad" : "Otra incidencia interna" };
    const { data: incident, error } = await supabase.from("incidencias").insert({
      tienda_id: storeId, asunto: incidentNames[data.tipo], tipo: data.tipo, area: data.area || "otro",
      descripcion: cleanText(data.descripcion), gravedad: data.gravedad, estado: "abierta",
      intervencion: isSecurityUser && !isPriceChange ? Boolean(data.intervencion) : false, detencion, detencion_detalle: detencion ? detencionDetalle : null,
      fecha: data.fecha || new Date().toISOString(), registrado_por: user.id,
    }).select().single();
    if (error) throw dbError(error);
    try {
      for (const item of isSecurityUser && Array.isArray(data.productos) ? data.productos : []) {
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
          codigo_nissei: cleanText(item.codigo) || null,
          producto, cantidad: Number(item.cantidad), valor: Number(item.valor || 0), recuperado: isPriceChange ? false : Boolean(item.recuperado),
        });
        if (inserted.error) throw dbError(inserted.error);
      }
      const personas = (isSecurityUser && data.tipo !== "cambio_precio" && Array.isArray(data.personas) ? data.personas : []).filter((item) => cleanText(item.nombre));
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

  async function updateIncident(event, user, id) {
    const data = bodyOf(event);
    requireFields(data, ["descripcion", "gravedad", "tipo", "fecha"]);
    const { data: existing, error: lookupError } = await supabase.from("incidencias").select("fecha").eq("id", id).eq("tienda_id", user.tienda_id).maybeSingle();
    if (lookupError) throw dbError(lookupError);
    if (!existing) throw httpError("La incidencia no existe.", 404);
    if (limaDateISO(existing.fecha) !== limaDateISO()) throw httpError("Esta incidencia ya no puede editarse porque corresponde a un día anterior.", 403);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-05:00$/.test(String(data.fecha)) || Number.isNaN(new Date(data.fecha).getTime())) throw httpError("La fecha y hora de la incidencia no son válidas.", 400);
    if (!["robo", "robo_frustrado", "robo_interno", "estafa", "asalto", "fiscalizacion", "cambio_precio", "otro"].includes(data.tipo) || !["baja", "media", "alta"].includes(data.gravedad)) throw httpError("Revisa el tipo y la severidad.", 400);
    if (!["piso_venta", "textil", "calzado", "hogar", "tecnologia", "electro", "belleza", "bano", "caja", "almacen", "ingreso", "exterior", "proveedores", "otro"].includes(data.area || "otro")) throw httpError("Selecciona un área válida.", 400);
    const isPriceChange = data.tipo === "cambio_precio", detencion = !isPriceChange && Boolean(data.detencion);
    if (detencion && !cleanText(data.detencion_detalle)) throw httpError("Describe los detalles de la detención.", 400);
    for (const item of Array.isArray(data.productos) ? data.productos : []) {
      if (!cleanText(item.marca) || !cleanText(item.producto) || !Number.isInteger(Number(item.cantidad)) || Number(item.cantidad) < 1 || item.valor === "" || !Number.isFinite(Number(item.valor)) || Number(item.valor) < 0) throw httpError("Revisa los productos involucrados.", 400);
    }
    if (!isPriceChange && (Array.isArray(data.personas) ? data.personas : []).some((item) => !cleanText(item.nombre) || !cleanText(item.rol))) throw httpError("Revisa las personas involucradas.", 400);
    const incidentNames = { robo: "Robo", robo_frustrado: "Robo frustrado", robo_interno: "Robo interno", estafa: "Estafa", asalto: "Asalto", fiscalizacion: "Fiscalización", cambio_precio: "Cambio de precio", otro: "Otra incidencia de seguridad" };
    const { data: incident, error } = await supabase.from("incidencias").update({ asunto: incidentNames[data.tipo], tipo: data.tipo, area: data.area || "otro", descripcion: cleanText(data.descripcion), gravedad: data.gravedad, intervencion: !isPriceChange && Boolean(data.intervencion), detencion, detencion_detalle: detencion ? cleanText(data.detencion_detalle) : null, fecha: data.fecha }).eq("id", id).eq("tienda_id", user.tienda_id).select().maybeSingle();
    if (error) throw dbError(error);
    if (!incident) throw httpError("La incidencia no existe.", 404);
    const removedProducts = await supabase.from("incidencia_productos").delete().eq("incidencia_id", id);
    const removedPeople = await supabase.from("incidencia_personas").delete().eq("incidencia_id", id);
    if (removedProducts.error || removedPeople.error) throw dbError(removedProducts.error || removedPeople.error);
    for (const item of Array.isArray(data.productos) ? data.productos : []) {
      const marcaNombre = cleanText(item.marca), producto = cleanText(item.producto);
      if (!marcaNombre || !producto || !Number.isInteger(Number(item.cantidad)) || Number(item.cantidad) < 1 || item.valor === "" || Number(item.valor) < 0) throw httpError("Revisa los productos involucrados.", 400);
      const lookup = await supabase.from("marcas").select("id,nombre");
      if (lookup.error) throw dbError(lookup.error);
      let marca = (lookup.data || []).find((row) => row.nombre.trim().toLocaleLowerCase("es") === marcaNombre.toLocaleLowerCase("es"));
      if (!marca) { const created = await supabase.from("marcas").insert({ nombre: marcaNombre }).select("id,nombre").single(); if (created.error) throw dbError(created.error); marca = created.data; }
      const inserted = await supabase.from("incidencia_productos").insert({ incidencia_id: id, marca_id: marca.id, codigo_nissei: cleanText(item.codigo) || null, producto, cantidad: Number(item.cantidad), valor: Number(item.valor), recuperado: isPriceChange ? false : Boolean(item.recuperado) });
      if (inserted.error) throw dbError(inserted.error);
    }
    if (!isPriceChange) {
      const people = (Array.isArray(data.personas) ? data.personas : []).filter((item) => cleanText(item.nombre));
      if (people.length) { const inserted = await supabase.from("incidencia_personas").insert(people.map((item) => ({ incidencia_id: id, nombre: cleanText(item.nombre), rol: cleanText(item.rol) || "Testigo", documento: cleanText(item.documento) || null, observacion: cleanText(item.observacion) || null }))); if (inserted.error) throw dbError(inserted.error); }
    }
    return incident;
  }

  async function listIncidents(event, user) {
    const rows = await listOperational("incidencias", event, user,
      "*,tiendas(nombre),usuarios!incidencias_registrado_por_fkey(nombres,apellidos,usuario),incidencia_productos(id,codigo_nissei,producto,cantidad,valor,recuperado,marcas(id,nombre)),incidencia_personas(id,nombre,rol,documento,observacion)");
    if (["seguridad", "jefe_seguridad"].includes(user.rol)) return rows.filter(isSecurityIncident);
    if (["jefe_tienda", "asistente_tienda"].includes(user.rol)) return rows.filter((row) => !isSecurityIncident(row));
    return rows;
  }

  const { securityAdminReport } = createSecurityDomain({
    supabase, dbError, httpError, todayISO, isISODate, fetchAllReportPages, isSecurityIncident, csvLine, businessDate, formatLimaTime, humanize,
  });

  async function listBrands() {
    const { data, error } = await readAllResult(supabase.from("marcas").select("id,nombre").order("nombre"));
    if (error) throw dbError(error);
    return data;
  }

  async function listStoreProducts(event, user) {
    const query = cleanText(event.queryStringParameters?.q).slice(0, 60);
    if (!query) return [];
    if (!user.tienda_id) throw httpError("Tu usuario no tiene una tienda asignada.", 400);
    const { data, error } = await supabase.from("productos_tienda")
      .select("producto_id,cantidad,precio_sugerido,productos!inner(codigo_nissei,sub_linea,marca,modelo,descripcion)")
      .eq("tienda_id", user.tienda_id)
      .ilike("productos.codigo_nissei", `%${query}%`)
      .order("producto_id")
      .limit(15);
    if (error) throw dbError(error);
    return (data || []).map((storeProduct) => {
      const product = storeProduct.productos;
      return {
        codigo: product.codigo_nissei || "",
        producto: product.descripcion || product.modelo || product.codigo_nissei || "",
        sublinea: product.sub_linea || "Sin sublínea",
        marca: product.marca || "Sin marca",
        precio: Number(storeProduct.precio_sugerido),
        stock: Number(storeProduct.cantidad),
      };
    });
  }

  async function exportIncidentsExcel(event, user) {
    const rows = await listIncidents(event, user);
    const workbook = await createExcelWorkbook();
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
      { header: "Detalle de detención", key: "detencion_detalle", width: 40 },
      { header: "Registrado por", key: "registrado_por", width: 28 }, { header: "Cantidad de productos", key: "productos", width: 20 },
      { header: "Valor involucrado", key: "valor", width: 19 }, { header: "Valor recuperado", key: "recuperado", width: 18 },
      { header: "Personas involucradas", key: "personas", width: 20 },
    ];
    incidents.addRows(rows.map((row) => ({
      codigo: incidentCode(row), tienda: row.tiendas?.nombre || "", fecha: formatLimaDate(row.fecha), hora: formatLimaTime(row.fecha), tipo: humanize(row.tipo), area: humanize(row.area),
      gravedad: humanize(row.gravedad), estado: humanize(row.estado || "abierta"), descripcion: row.descripcion,
      intervencion: row.intervencion ? "Sí" : "No", detencion: row.detencion ? "Sí" : "No", detencion_detalle: row.detencion_detalle || "",
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
      { header: "Código Nissei", key: "codigo_nissei", width: 20 }, { header: "Producto", key: "producto", width: 30 }, { header: "Marca", key: "marca", width: 24 },
      { header: "Cantidad", key: "cantidad", width: 12 }, { header: "Valor unitario", key: "valor", width: 18 },
      { header: "Valor total", key: "total", width: 18 }, { header: "Recuperado", key: "recuperado", width: 14 },
    ];
    for (const row of rows) for (const item of row.incidencia_productos || []) products.addRow({
      codigo: incidentCode(row), tienda: row.tiendas?.nombre || "", codigo_nissei: item.codigo_nissei || "", producto: item.producto, marca: item.marcas?.nombre || "",
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
    if (!data || Number(data.tienda_id) !== Number(storeId) || !["trabajador", "vendedor", "asistente", "caja", "almacenero", "jefe_area", "seguridad", "jefe_seguridad", "asistente_tienda"].includes(data.rol)) {
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

  async function listSpecialCoverages(user) {
    const { data, error } = await readAllResult(supabase.from("coberturas_especiales")
      .select("*,cobertura_trabajadores(*,usuarios(nombres,apellidos),origen:tiendas!cobertura_trabajadores_tienda_origen_id_fkey(nombre),destino:tiendas!cobertura_trabajadores_tienda_destino_id_fkey(nombre))")
      .eq("tienda_destino_id", user.tienda_id).order("fecha_inicio", { ascending: false }));
    if (error) throw dbError(error);
    return data;
  }

  async function listCoverageCandidates(user) {
    const { data, error } = await readAllResult(supabase.from("usuarios")
      .select("id,nombres,apellidos,dni,area_laboral,tienda_id,tiendas!usuarios_tienda_id_fkey(nombre)")
      .eq("estado", "activo").in("rol", storeStaffRoles.filter(role => !["seguridad", "jefe_seguridad"].includes(role))).order("nombres"));
    if (error) throw dbError(error);
    return data.filter(row => Number(row.tienda_id) !== Number(user.tienda_id)).map(({ tiendas, ...row }) => ({ ...row, tienda_nombre: tiendas?.nombre || null }));
  }

  async function saveSpecialCoverage(event, user) {
    const data = { ...bodyOf(event), fecha_inicio: todayISO(), fecha_fin: todayISO(), tipo_dia: "especial", motivo: "Apoyo de personal del dia", estado: "confirmada" };
    requireFields(data, ["trabajadores"]);
    if (!isISODate(data.fecha_inicio) || !isISODate(data.fecha_fin) || data.fecha_fin < data.fecha_inicio) throw httpError("El período de cobertura no es válido.", 400);
    if (!["sabado", "domingo", "feriado", "especial"].includes(data.tipo_dia)) throw httpError("Selecciona un tipo de día válido.", 400);
    if (!["borrador", "confirmada"].includes(data.estado)) throw httpError("El estado de cobertura no es válido.", 400);
    if (!Array.isArray(data.trabajadores) || !data.trabajadores.length || data.trabajadores.length > 100) throw httpError("Agrega al menos un trabajador.", 400);
    const candidates = await listCoverageCandidates(user);
    data.trabajadores = data.trabajadores.map(row => {
      const match = !row.usuario_id && row.dni ? candidates.find(person => person.dni === row.dni) : null;
      return match ? { ...row, usuario_id: match.id } : row;
    });
    const ids = validIds(data.trabajadores.filter((row) => row.usuario_id).map((row) => row.usuario_id));
    if (ids.length !== data.trabajadores.filter((row) => row.usuario_id).length) throw httpError("No repitas un trabajador en la misma cobertura.", 400);
    const people = candidates.filter((person) => ids.includes(person.id));
    if (people.length !== ids.length || people.some(person => Number(person.tienda_id) === Number(user.tienda_id))) throw httpError("Uno de los trabajadores no está activo o no puede asignarse a la cobertura.", 400);
    for (const row of data.trabajadores) {
      const hours = Number(row.horas);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24 || Math.round(hours * 100) / 100 !== hours) {
        throw httpError('Indica las horas de apoyo de cada trabajador: mayor que 0 y hasta 24, con máximo dos decimales.', 400);
      }
      if (!row.usuario_id) {
        const name = cleanText(row.nombre_manual);
        if (!name || name.length > 200) throw httpError("Escribe el nombre del trabajador (máximo 200 caracteres).", 400);
        if (!cleanText(row.origen_manual) || cleanText(row.origen_manual).length > 200) throw httpError("Escribe la tienda de origen (máximo 200 caracteres).", 400);
        if (row.dni && !/^\d{8}$/.test(row.dni)) throw httpError("El DNI debe tener 8 dígitos o quedar vacío.", 400);
      }
    }
    const details = data.trabajadores.map(row => ({
      usuario_id: row.usuario_id ? Number(row.usuario_id) : null,
      horas: Number(row.horas),
      area: normalizeLaborArea(row.area) || null,
      ...(!row.usuario_id ? { nombre_manual: cleanText(row.nombre_manual), dni_manual: row.dni || null, origen_manual: cleanText(row.origen_manual) } : {}),
      observacion: cleanText(row.observacion) || null,
    }));
    const { data: coverage, error } = await supabase.rpc('registrar_cobertura_diaria', {
      p_tienda_id: user.tienda_id, p_creado_por: user.id, p_trabajadores: details,
    });
    if (error?.code === '23505') throw httpError('Ese trabajador ya tiene un apoyo registrado hoy. Revisa la cobertura existente.', 409);
    if (error) throw dbError(error);
    return coverage;
  }

  async function executiveAlerts() {
    const ids = await activeStoreIds();
    const [incidents, documents] = await Promise.all([
      fetchAllReportPages(supabase.from("incidencias").select("id,tienda_id,fecha,tipo,asunto,gravedad,estado,tiendas(nombre)").in("tienda_id", ids.length ? ids : [0]).order("fecha", { ascending: false }).order("id")),
      fetchAllReportPages(supabase.from("documentos_municipales").select("id,tienda_id,tipo_documento,fecha_vencimiento,dias_alerta,tiendas(nombre)").in("tienda_id", ids.length ? ids : [0]).order("id")),
    ]);
    return { incidents, documents };
  }

  async function dashboardPeople(event, user) {
    const scope = await resolveStoreScope(user, event.queryStringParameters?.tienda_id);
    return fetchAllReportPages(applyStoreScope(supabase.from("usuarios").select("id,nombres,apellidos,rol,estado,tienda_id,fecha_ingreso,fecha_salida,motivo_salida,periodos_laborales!periodos_laborales_usuario_id_fkey(fecha_ingreso,fecha_salida,motivo_salida)").in("rol", storeStaffRoles), scope).order("nombres").order("id"));
  }

  async function operationalSummary(event, user) {
    const storeId = await operationalStoreId(event, user);
    const today = todayISO();
    const [traffic, incidents, securityFixed, securityOther, warnings, errors, documents, administration, activePersonnel] = await Promise.all([
      supabase.from("trafico_tienda").select("cantidad").eq("tienda_id", storeId).eq("fecha", today),
      supabase.from("incidencias").select("id", { count: "exact", head: true }).eq("tienda_id", storeId),
      supabase.from("incidencias").select("id", { count: "exact", head: true }).eq("tienda_id", storeId).in("tipo", ["robo", "robo_frustrado", "robo_interno", "estafa", "asalto", "fiscalizacion", "cambio_precio"]),
      supabase.from("incidencias").select("id", { count: "exact", head: true }).eq("tienda_id", storeId).eq("tipo", "otro").eq("asunto", "Otra incidencia de seguridad"),
      supabase.from("amonestaciones").select("id", { count: "exact", head: true }).eq("tienda_id", storeId),
      supabase.from("errores_personal").select("id", { count: "exact", head: true }).eq("tienda_id", storeId),
      supabase.from("documentos_municipales").select("fecha_vencimiento,dias_alerta").eq("tienda_id", storeId).gte("fecha_vencimiento", today),
      supabase.from("usuarios").select("id", { count: "exact", head: true }).eq("tienda_id", storeId).eq("estado", "activo").in("rol", ["jefe_tienda", "asistente_tienda"]),
      supabase.from("usuarios").select("id", { count: "exact", head: true }).eq("tienda_id", storeId).eq("estado", "activo").in("rol", storeStaffRoles),
    ]);
    for (const result of [traffic, incidents, securityFixed, securityOther, warnings, errors]) if (result.error) throw dbError(result.error);
    if (administration.error) throw dbError(administration.error);
    if (activePersonnel.error) throw dbError(activePersonnel.error);
    if (documents.error) throw dbError(documents.error);
    const documentosPorVencer = (documents.data || []).filter((row) => Number(row.fecha_vencimiento.slice(0, 10).replaceAll("-", "")) >= Number(today.replaceAll("-", "")) && Math.round((Date.parse(`${row.fecha_vencimiento}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000) <= Number(row.dias_alerta || 30)).length;
    const securityIncidents = (securityFixed.count || 0) + (securityOther.count || 0);
    return { trafico_hoy: (traffic.data || []).reduce((total, row) => total + Number(row.cantidad || 0), 0), incidencias: incidents.count || 0,
      incidencias_seguridad: securityIncidents, incidencias_administrativas: (incidents.count || 0) - securityIncidents,
      amonestaciones: warnings.count || 0, errores: errors.count || 0, documentos_por_vencer: documentosPorVencer, administracion_tienda: administration.count || 0, personal_activo: activePersonnel.count || 0 };
  }

  async function storeSalesForecast(event, user) {
    const storeId = await operationalStoreId(event, user);
    const { data: mapping, error: mappingError } = await supabase.from("commercial_store_map")
      .select("dashboard_store_id").eq("tienda_id", storeId).maybeSingle();
    if (mappingError) throw dbError(mappingError);
    if (!mapping?.dashboard_store_id) throw httpError("La tienda todavía no está vinculada al dashboard comercial.", 404);
    const company = await commercialCompanyRanking(user);
    const salesCutoff = company.salesCutoff || (await publishedCommercialRelease()).sales_cutoff;
    const [goals, traffic, attendance] = await Promise.all([
      commercialStoreGoals(user),
      fetchAllReportPages(supabase.from("trafico_tienda").select("fecha,cantidad").eq("tienda_id", storeId)
        .gte("fecha", addDays(salesCutoff, -70)).lte("fecha", salesCutoff).order("fecha")),
      fetchAllReportPages(supabase.from("asistencias").select("fecha,estado").eq("tienda_id", storeId)
        .gte("fecha", addDays(salesCutoff, -45)).lte("fecha", salesCutoff).order("fecha")),
    ]);
    const dashboardStoreId = mapping.dashboard_store_id;
    const monthlySales = company.monthlyStore.filter(row => row.storeId === dashboardStoreId);
    const monthlyTargets = goals.goals.filter(row => row.storeId === dashboardStoreId && !row.category);
    const predictive = company.predictiveStore.find(row => row.storeId === dashboardStoreId) || null;
    return { storeId, dashboardStoreId, ...buildStoreSalesForecast({ monthlySales, monthlyTargets, predictive,
      salesCutoff, traffic, attendance }) };
  }

  async function listTrafficMatrix(event, user) {
    const query = event.queryStringParameters || {};
    const today = todayISO();
    const desde = isISODate(query.desde) ? query.desde : addDays(today, -6);
    const hasta = isISODate(query.hasta) ? query.hasta : today;
    let scope = await resolveStoreScope(user, query.tienda_id);
    if (user.rol === "gerencia_general") scope = Number(query.tienda_id) || await activeStoreIds();
    if (user.rol === "jefe_zonal") {
      const ids = await zonalStoreIds(user.id);
      const requested = Number(query.tienda_id) || null;
      if (requested && !ids.includes(requested)) throw httpError("La tienda no pertenece a tu zona.", 403);
      scope = requested || ids;
    }
    let request = supabase.from("trafico_tienda").select("id,tienda_id,fecha,rango_hora,cantidad,observaciones,tiendas(nombre)").gte("fecha", desde).lte("fecha", hasta);
    request = applyStoreScope(request, scope);
    const registros = await fetchAllReportPages(request.order("fecha", { ascending: false }).order("rango_hora").order("id"));
    return { desde, hasta, alcance: hasStoreScope(scope) && !Array.isArray(scope) ? "tienda" : "consolidado", registros };
  }

  return { listOperational, listDashboardDocumentAlerts, saveTraffic, updateTraffic, exportTrafficExcel, createIncident, updateIncident, listIncidents, listBrands, listStoreProducts, exportIncidentsExcel, incidentCode, humanize, formatLimaDate, createDisciplinary, createStoreDocument, listSpecialCoverages, listCoverageCandidates, saveSpecialCoverage, executiveAlerts, dashboardPeople, operationalSummary, storeSalesForecast, listTrafficMatrix, securityAdminReport };
}
