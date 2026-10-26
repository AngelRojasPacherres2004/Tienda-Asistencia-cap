export function createSecurityDomain({ supabase, dbError, httpError, todayISO, isISODate, fetchAllReportPages, isSecurityIncident, csvLine, businessDate, formatLimaTime, humanize }) {
  const securityReportColumns = ["tipo_registro", "fecha", "tienda", "rango_hora", "hora_evento", "visitantes", "tipo_incidencia", "gravedad", "estado", "descripcion", "unidades_afectadas", "valor_referencial"];
  const securityReportLabels = ["Tipo de registro", "Fecha", "Tienda", "Rango horario", "Hora del hecho", "Visitantes", "Tipo de incidencia", "Gravedad", "Estado", "Descripción", "Unidades afectadas", "Valor referencial (S/)"];
  const securityPageSize = 100;
  const securityIncidentFilter = 'tipo.in.(robo,robo_frustrado,robo_interno,estafa,asalto,fiscalizacion,cambio_precio),and(tipo.eq.otro,asunto.eq."Otra incidencia de seguridad")';

  async function securityPreviewRows(request, first, last) {
    const rows = [];
    let total = 0;
    for (let offset = first; offset <= last; offset += 1000) {
      const end = Math.min(last, offset + 999);
      const { data, count, error } = await request.range(offset, end);
      if (error) throw dbError(error);
      if (offset === first) total = count || 0;
      rows.push(...(data || []));
      if (!data || data.length < end - offset + 1) break;
    }
    return { rows, total };
  }

  async function securityAdminReport(event) {
    const query = event.queryStringParameters || {};
    const kind = ["todo", "trafico", "incidencias", "personal"].includes(query.tipo) ? query.tipo : "todo";
    const today = todayISO();
    const desde = query.desde || `${today.slice(0, 7)}-01`;
    const hasta = query.hasta || today;
    if (kind !== "personal" && (!isISODate(desde) || !isISODate(hasta) || desde > hasta
      || (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000 > 30)) {
      throw httpError("Selecciona un período válido de hasta 31 días.", 400);
    }
    const storeId = query.tienda_id ? Number(query.tienda_id) : null;
    if (query.tienda_id && (!Number.isInteger(storeId) || storeId < 1)) throw httpError("Tienda no válida.", 400);
    const { data: stores, error: storesError } = await supabase.from("tiendas").select("id,nombre").order("nombre");
    if (storesError) throw dbError(storesError);
    if (storeId && !stores.some(store => store.id === storeId)) throw httpError("Tienda no encontrada.", 404);
    const storeNames = new Map(stores.map(store => [store.id, store.nombre]));
    const page = Math.min(100, Math.max(1, Number.parseInt(query.page, 10) || 1));
    const first = (page - 1) * securityPageSize;
    const last = first + securityPageSize - 1;
    if (kind === "personal") {
      let request = supabase.from("usuarios").select("id,nombres,apellidos,dni,telefono,rol,estado,tienda_id,fecha_ingreso,fecha_salida", { count: "exact" })
        .in("rol", ["seguridad", "jefe_seguridad"]).order("estado").order("nombres").order("apellidos").order("id");
      if (storeId) request = request.eq("tienda_id", storeId);
      const result = query.export === "1"
        ? { rows: await fetchAllReportPages(request), total: 0 }
        : await securityPreviewRows(request, first, last);
      const rows = result.rows.map(person => ({ ...person, tienda: storeNames.get(person.tienda_id) || "—" }));
      if (query.export === "1") {
        const columns = ["tienda", "nombres", "apellidos", "dni", "telefono", "rol", "estado", "fecha_ingreso", "fecha_salida"];
        const labels = ["Tienda", "Nombres", "Apellidos", "DNI", "Teléfono", "Cargo", "Estado", "Fecha de ingreso", "Fecha de salida"];
        return { statusCode: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="personal-seguridad-${storeId || "todas"}.csv"`, "Cache-Control": "no-store" },
          body: "\uFEFF" + labels.map(label => csvLine({ label }, ["label"]).trim()).join(",") + "\r\n" + rows.map(row => csvLine(row, columns)).join("") };
      }
      return { rows, total: result.total, stores };
    }
    const requests = [];
    if (kind !== "incidencias") {
      let traffic = supabase.from("trafico_tienda").select("id,tienda_id,fecha,rango_hora,cantidad,observaciones", { count: "exact" })
        .gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false }).order("rango_hora", { ascending: false }).order("id", { ascending: false });
      if (storeId) traffic = traffic.eq("tienda_id", storeId);
      requests.push(query.export === "1" ? fetchAllReportPages(traffic).then(rows => ({ rows, total: rows.length }))
        : securityPreviewRows(traffic, kind === "todo" ? 0 : first, kind === "todo" ? page * securityPageSize - 1 : last));
    } else requests.push(Promise.resolve({ rows: [], total: 0 }));
    if (kind !== "trafico") {
      let incidents = supabase.from("incidencias").select("id,tienda_id,fecha,tipo,asunto,gravedad,estado,descripcion,incidencia_productos(cantidad,valor)", { count: "exact" })
        .or(securityIncidentFilter).gte("fecha", `${desde}T00:00:00-05:00`).lte("fecha", `${hasta}T23:59:59.999-05:00`)
        .order("fecha", { ascending: false }).order("id", { ascending: false });
      if (storeId) incidents = incidents.eq("tienda_id", storeId);
      requests.push(query.export === "1" ? fetchAllReportPages(incidents).then(rows => ({ rows, total: rows.length }))
        : securityPreviewRows(incidents, kind === "todo" ? 0 : first, kind === "todo" ? page * securityPageSize - 1 : last));
    } else requests.push(Promise.resolve({ rows: [], total: 0 }));
    const [trafficResult, incidentResult] = await Promise.all(requests);
    const incidents = incidentResult.rows.filter(isSecurityIncident);
    const rows = [
      ...trafficResult.rows.map(row => ({ id: `T-${row.id}`, tipo_registro: "Tráfico", fecha: row.fecha,
        tienda: storeNames.get(row.tienda_id) || "—", rango_hora: row.rango_hora, hora_evento: "",
        visitantes: Number(row.cantidad) || 0, tipo_incidencia: "", gravedad: "", estado: "Registrado",
        descripcion: row.observaciones || "", unidades_afectadas: "", valor_referencial: "",
        _sortTime: `${row.fecha}T${row.rango_hora?.slice(0, 5) || "00:00"}:00-05:00` })),
      ...incidents.map(row => ({ id: `I-${row.id}`, tipo_registro: "Incidencia", fecha: businessDate(row.fecha),
        tienda: storeNames.get(row.tienda_id) || "—", rango_hora: "", hora_evento: formatLimaTime(row.fecha), visitantes: "",
        tipo_incidencia: humanize(row.tipo), gravedad: humanize(row.gravedad), estado: humanize(row.estado),
        descripcion: row.descripcion || "", unidades_afectadas: (row.incidencia_productos || []).reduce((n, item) => n + (Number(item.cantidad) || 0), 0),
        valor_referencial: (row.incidencia_productos || []).reduce((n, item) => n + (Number(item.valor) || 0), 0), _sortTime: row.fecha })),
    ].sort((a, b) => new Date(b._sortTime).getTime() - new Date(a._sortTime).getTime()
      || b.id[0].localeCompare(a.id[0]) || Number(b.id.slice(2)) - Number(a.id.slice(2)))
      .map(row => { const cleaned = { ...row }; delete cleaned._sortTime; return cleaned; });
    if (query.export === "1") {
      const body = "\uFEFF" + securityReportLabels.map(label => csvLine({ label }, ["label"]).trim()).join(",") + "\r\n"
        + rows.map(row => csvLine(row, securityReportColumns)).join("");
      return { statusCode: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="seguridad-${kind}-${storeId || "todas"}-${desde}-${hasta}.csv"`, "Cache-Control": "no-store" }, body };
    }
    return { rows: kind === "todo" ? rows.slice(first, last + 1) : rows, total: trafficResult.total + incidentResult.total, stores };
  }

  return { securityAdminReport };
}
