export function createDashboardDomain({
  activeStoreIds, attendanceCounts, courseProgress, dbError,
  employmentPeriods, fetchAllReportPages, httpError, isISODate,
  presenteEstados, readAllResult, resolveStoreScope, rotationCounts,
  storeStaffRoles, supabase, todayISO, zonalStoreIds,
}) {
  async function countRows(table, build) {
    let request = supabase.from(table).select("id", { count: "exact", head: true });
    if (build) request = build(request);
    const { count, error } = await request;
    if (error) throw dbError(error);
    return count || 0;
  }

  function hasStoreScope(scope) {
    return scope !== null && scope !== undefined;
  }

  function applyStoreScope(request, scope) {
    if (!hasStoreScope(scope)) return request;
    return Array.isArray(scope) ? request.in("tienda_id", scope.length ? scope : [0]) : request.eq("tienda_id", scope);
  }

  async function getSummary(tiendaFilter, today, monthStart) {
    const [tiendasActivas, usuariosActivos, hoyPresentes, mesTotal, mesPresentes, cursosEnCurso] = await Promise.all([
      countRows("tiendas", (q) => {
        const active = q.eq("estado", "activo");
        if (!hasStoreScope(tiendaFilter)) return active;
        return Array.isArray(tiendaFilter) ? active.in("id", tiendaFilter.length ? tiendaFilter : [0]) : active.eq("id", tiendaFilter);
      }),
      countRows("usuarios", (q) => {
        const scoped = q.eq("estado", "activo").in("rol", storeStaffRoles);
        return applyStoreScope(scoped, tiendaFilter);
      }),
      countRows("asistencias", (q) => {
        const scoped = q.eq("fecha", today).in("estado", [...presenteEstados]);
        return applyStoreScope(scoped, tiendaFilter);
      }),
      countRows("asistencias", (q) => {
        const scoped = q.gte("fecha", monthStart).lte("fecha", today);
        return applyStoreScope(scoped, tiendaFilter);
      }),
      countRows("asistencias", (q) => {
        const scoped = q.gte("fecha", monthStart).lte("fecha", today).in("estado", [...presenteEstados]);
        return applyStoreScope(scoped, tiendaFilter);
      }),
      countRows("capacitacion_progreso", (q) => {
        const scoped = q.eq("estado", "en_curso");
        return applyStoreScope(scoped, tiendaFilter);
      }),
    ]);
    return {
      tiendas_activas: tiendasActivas,
      usuarios_activos: usuariosActivos,
      asistencias_hoy: hoyPresentes,
      tasa_asistencia_mes: mesTotal ? Math.round((mesPresentes / mesTotal) * 100) : null,
      cursos_en_curso: cursosEnCurso,
    };
  }

  async function getStates(tiendaFilter, monthStart, today) {
    let request = supabase.from("asistencias").select("estado").gte("fecha", monthStart).lte("fecha", today);
    request = applyStoreScope(request, tiendaFilter);
    const data = await fetchAllReportPages(request.order("id"));
    const counts = {};
    for (const row of data) counts[row.estado] = (counts[row.estado] || 0) + 1;
    return Object.entries(counts).map(([estado, cantidad]) => ({ estado, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
  }

  async function getTrend(tiendaFilter, selectedYear) {
    const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const months = [];
    const year = Number(selectedYear);
    for (let month = 0; month < 12; month += 1) {
      const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
      months.push({ label: monthLabels[month], start, end });
    }
    return Promise.all(months.map(async ({ label, start, end }) => {
      let request = supabase.from("asistencias").select("estado").gte("fecha", start).lte("fecha", end);
      request = applyStoreScope(request, tiendaFilter);
      const data = await fetchAllReportPages(request.order("id"));
      const total = data.length;
      const presentes = data?.filter((row) => presenteEstados.has(row.estado)).length || 0;
      return { mes: label, registros: total, tasa: total ? Math.round((presentes / total) * 100) : null };
    }));
  }

  async function getWorkload(tiendaFilter, monthStart, today) {
    let request = supabase.from("asistencias").select("usuario_id,tienda_id,estado").gte("fecha", monthStart).lte("fecha", today);
    request = applyStoreScope(request, tiendaFilter);
    const data = await fetchAllReportPages(request.order("id"));
    const groupKey = Array.isArray(tiendaFilter) || !hasStoreScope(tiendaFilter) ? "tienda_id" : "usuario_id";
    const groups = new Map();
    for (const row of data) {
      const key = row[groupKey];
      if (!groups.has(key)) groups.set(key, { presentes: 0, otros: 0, faltas: 0, total: 0 });
      const group = groups.get(key);
      group.total += 1;
      if (presenteEstados.has(row.estado)) group.presentes += 1;
      else if (row.estado === "falta") group.faltas += 1;
      else group.otros += 1;
    }
    const ids = [...groups.keys()];
    if (!ids.length) return [];
    const names = new Map();
    if (groupKey === "usuario_id") {
      const { data: users } = await supabase.from("usuarios").select("id,nombres,apellidos").in("id", ids);
      for (const user of users || []) names.set(user.id, `${user.nombres} ${user.apellidos}`.trim());
    } else {
      const { data: tiendas } = await supabase.from("tiendas").select("id,nombre").in("id", ids);
      for (const tienda of tiendas || []) names.set(tienda.id, tienda.nombre);
    }
    return [...groups.entries()]
      .map(([id, group]) => ({ nombre: names.get(id) || `#${id}`, ...group }))
      .sort((a, b) => b.total - a.total);
  }

  async function getCourseProgress(tiendaFilter) {
    const [courses, people, progress] = await Promise.all([
      fetchAllReportPages(supabase.from("cursos").select("id,nombre,curso_roles(rol_codigo)").eq("activo", true).order("id")),
      fetchAllReportPages(applyStoreScope(supabase.from("usuarios").select("id,rol").eq("estado", "activo").in("rol", storeStaffRoles), tiendaFilter).order("id")),
      fetchAllReportPages(applyStoreScope(supabase.from("capacitacion_progreso").select("curso_id,usuario_id,estado"), tiendaFilter).order("id")),
    ]);
    return courseProgress(courses, people, progress);
  }

  async function getRotation(tiendaFilter, desde, hasta) {
    const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    let request = supabase.from("usuarios").select("fecha_ingreso,fecha_salida,tienda_id,periodos_laborales!periodos_laborales_usuario_id_fkey(fecha_ingreso,fecha_salida)").in("rol", storeStaffRoles);
    request = applyStoreScope(request, tiendaFilter);
    const data = await fetchAllReportPages(request.order("id"));
    const months = [];
    const cursor = new Date(`${desde}T00:00:00Z`);
    const observedEnd = hasta < todayISO() ? hasta : todayISO();
    const limit = new Date(`${observedEnd}T00:00:00Z`);
    cursor.setUTCDate(1);
    while (cursor <= limit && months.length < 24) {
      const year = cursor.getUTCFullYear();
      const month = cursor.getUTCMonth();
      const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
      months.push({ mes: monthLabels[month], anio: year, ...rotationCounts(data.flatMap(employmentPeriods), start, end < observedEnd ? end : observedEnd) });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return months;
  }

  async function getWarningsByWorker(tiendaFilter, desde, hasta) {
    let request = supabase.from("amonestaciones")
      .select("id,fecha,tipo,usuario_id,usuarios!amonestaciones_usuario_id_fkey(nombres,apellidos,usuario)")
      .gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false });
    request = applyStoreScope(request, tiendaFilter);
    const data = await fetchAllReportPages(request.order("id"));
    const documentLabels = { verbal: "Amonestación verbal", carta_amonestacion: "Carta de amonestación", memorandum: "Memorándum" };
    return {
      total: (data || []).length,
      rows: (data || []).slice(0, 8).map((row) => ({
        id: row.id, fecha: row.fecha,
        trabajador: `${row.usuarios?.nombres || ""} ${row.usuarios?.apellidos || ""}`.trim() || row.usuarios?.usuario || "Sin identificar",
        documento: documentLabels[row.tipo] || row.tipo || "Amonestación",
      })),
    };
  }

  async function getAttendanceByWorker(tiendaFilter, desde, hasta) {
    let request = supabase.from("asistencias").select("usuario_id,estado").gte("fecha", desde).lte("fecha", hasta);
    request = applyStoreScope(request, tiendaFilter);
    const data = await fetchAllReportPages(request.order("id"));
    const groups = new Map();
    for (const row of data || []) {
      if (!groups.has(row.usuario_id)) groups.set(row.usuario_id, []);
      groups.get(row.usuario_id).push(row);
    }
    const ids = [...groups.keys()];
    if (!ids.length) return [];
    const { data: users, error: userError } = await readAllResult(supabase.from("usuarios").select("id,nombres,apellidos,usuario,estado").in("id", ids));
    if (userError) throw dbError(userError);
    const names = new Map((users || []).map((user) => [user.id, `${user.nombres || ""} ${user.apellidos || ""}`.trim() || user.usuario || "Sin identificar"]));
    const userStates = new Map((users || []).map(user => [user.id, user.estado]));
    return [...groups.entries()].map(([id, counts]) => ({
      usuario_id: id, nombre: names.get(id) || "Sin identificar", ...attendanceCounts(counts),
      estado_actual: userStates.get(id),
      suspension: counts.filter(row => row.estado === "suspension").length,
    })).sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));
  }

  async function getErrorsByResponsible(tiendaFilter, desde, hasta) {
    let request = supabase.from("errores_personal")
      .select("id,fecha,categoria,descripcion,accion_correctiva,usuario_id,tienda_id,usuarios!errores_personal_usuario_id_fkey(nombres,apellidos,usuario),tiendas(nombre)")
      .gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false });
    request = applyStoreScope(request, tiendaFilter);
    const data = await fetchAllReportPages(request.order("id"));
    const groups = new Map();
    for (const row of data || []) {
      const personName = `${row.usuarios?.nombres || ""} ${row.usuarios?.apellidos || ""}`.trim();
      const name = personName || row.usuarios?.usuario || row.categoria || "Sin identificar";
      const key = row.usuario_id || `area:${row.tienda_id}:${row.categoria}`;
      const group = groups.get(key) || { id: key, name, value: 0, areas: new Set(), rows: [] };
      group.value += 1;
      if (row.categoria) group.areas.add(row.categoria);
      group.rows.push({
        id: row.id, fecha: row.fecha, categoria: row.categoria || "Sin categoría",
        descripcion: row.descripcion || "", accion_correctiva: row.accion_correctiva || "",
        tienda: row.tiendas?.nombre || "Tienda sin identificar",
      });
      groups.set(key, group);
    }
    return [...groups.values()]
      .map((group) => ({ ...group, area: [...group.areas].join(", ") || "Sin área", areas: undefined }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  }

  async function getDashboard(user, event) {
    const query = event.queryStringParameters || {};
    const today = todayISO();
    const defaultStart = `${today.slice(0, 4)}-01-01`;
    const desde = isISODate(query.desde) ? query.desde : defaultStart;
    const hasta = isISODate(query.hasta) ? query.hasta : today;
    if (desde > hasta) throw httpError("La fecha inicial no puede ser posterior a la final.", 400);
    const rotationYear = /^\d{4}$/.test(String(query.rotation_year || "")) ? String(query.rotation_year) : today.slice(0, 4);
    const rotationDesde = `${rotationYear}-01-01`;
    const rotationHasta = `${rotationYear}-12-31`;
    let tiendaFilter = await resolveStoreScope(user, query.tienda_id);
    if (["gerencia_general", "gerente_comercial"].includes(user.rol) && !tiendaFilter) tiendaFilter = await activeStoreIds();
    if (user.rol === "jefe_zonal") {
      const assignedStoreIds = await zonalStoreIds(user.id);
      const requestedStoreId = Number(query.tienda_id) || null;
      if (requestedStoreId && !assignedStoreIds.includes(requestedStoreId)) throw httpError("La tienda no pertenece a tu clúster.", 403);
      tiendaFilter = requestedStoreId || assignedStoreIds;
    }
    const [summary, states, trend, workload, progresoCursos, rotation, errorsByResponsible, warningsByWorker, attendanceByWorker] = await Promise.all([
      getSummary(tiendaFilter, hasta, desde),
      getStates(tiendaFilter, desde, hasta),
      getTrend(tiendaFilter, rotationYear),
      getWorkload(tiendaFilter, desde, hasta),
      getCourseProgress(tiendaFilter),
      getRotation(tiendaFilter, rotationDesde, rotationHasta),
      getErrorsByResponsible(tiendaFilter, desde, hasta),
      getWarningsByWorker(tiendaFilter, desde, hasta),
      getAttendanceByWorker(tiendaFilter, desde, hasta),
    ]);
    summary.cursos_en_curso = progresoCursos.reduce((sum, row) => sum + row.en_curso, 0);
    return { summary, states, trend, workload, progresoCursos, rotation, errorsByResponsible, warningsByWorker, attendanceByWorker, filters: { desde, hasta, rotation_year: rotationYear, tienda_id: tiendaFilter } };
  }

  return { hasStoreScope, applyStoreScope, getDashboard };
}
