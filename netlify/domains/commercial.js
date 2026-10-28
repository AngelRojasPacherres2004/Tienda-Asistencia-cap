import { storeTransferOpportunities } from '../lib/store-transfers.js';
export function createCommercialDomain({ supabase, commercialAccess, dbError, httpError, readAllResult, fetchAllReportPages, normalizeGoalRubro, aggregateCommercialGoalTotals, bodyOf, cleanText, validCommercialPartPath, gunzipSync }) {
  async function currentCommercialAccess(sessionUser) {
    const [{ data: account, error: accountError }, { data: scope, error: scopeError }, { data: storeMap, error: mapError }] = await Promise.all([
      supabase.from("usuarios").select("id,rol,estado,tienda_id").eq("id", sessionUser.id).maybeSingle(),
      supabase.from("commercial_user_scopes").select("scope_type,scope_value").eq("usuario_id", sessionUser.id).maybeSingle(),
      supabase.from("commercial_store_map").select("dashboard_store_id,tienda_id,cluster_code"),
    ]);
    if (accountError || scopeError || mapError) throw dbError(accountError || scopeError || mapError);
    let assignedCluster = null;
    if (account?.rol === "jefe_zonal") {
      const { data, error } = await supabase.from("clusters")
        .select("codigo,estado").eq("jefe_zonal_id", account.id).eq("estado", "activo").maybeSingle();
      if (error) throw dbError(error);
      assignedCluster = data;
    }
    // The active support store was checked against current grants at the request boundary.
    const contextualAccount = account?.rol === "jefe_tienda" ? { ...account, tienda_id: sessionUser.tienda_id } : account;
    const contextualStore = account?.rol === "jefe_tienda" && Number(sessionUser.tienda_id) !== Number(account.tienda_id)
      ? (storeMap || []).find(row => Number(row.tienda_id) === Number(sessionUser.tienda_id)) : null;
    const contextualScope = contextualStore ? { scope_type: "store", scope_value: contextualStore.dashboard_store_id } : scope;
    const access = commercialAccess(contextualAccount, contextualScope, storeMap || [], assignedCluster);
    if (!access) throw httpError("Tu usuario no tiene acceso a los datos comerciales de este alcance.", 403);
    return { ...access, role: account.rol };
  }

  async function commercialOperationalSummary(sessionUser) {
    const access = await currentCommercialAccess(sessionUser);
    const { data: mappings, error: mappingError } = await supabase.from('commercial_store_map')
      .select('dashboard_store_id,tienda_id').in('dashboard_store_id', access.storeIds);
    if (mappingError) throw dbError(mappingError);
    const storeIds = [...new Set((mappings || []).map(row => row.tienda_id))];
    if (!storeIds.length) return { courses: [], training: [], departures: [], incidents: [] };
    const dashboardId = new Map(mappings.map(row => [row.tienda_id, row.dashboard_store_id]));
    const [usersResult, trainingResult, coursesResult, incidentsResult, zonalResult] = await Promise.all([
      readAllResult(supabase.from('usuarios').select('id,tienda_id,rol,fecha_salida,motivo_salida').in('tienda_id', storeIds)),
      readAllResult(supabase.from('capacitacion_progreso').select('id,usuario_id,tienda_id,curso_id,estado').in('tienda_id', storeIds)),
      supabase.from('cursos').select('id,nombre').eq('activo', true).order('id').limit(5),
      readAllResult(supabase.from('incidencias').select('id,tienda_id,fecha,tipo').in('tienda_id', storeIds).gte('fecha', '2024-01-01')),
      readAllResult(supabase.from('incidencias_zonales').select('id,tienda_origen_id,tienda_afectada_id,fecha,tipo,alcance')
        .or(`tienda_origen_id.in.(${storeIds.join(',')}),tienda_afectada_id.in.(${storeIds.join(',')})`).gte('fecha', '2024-01-01')),
    ]);
    const failure = [usersResult, trainingResult, coursesResult, incidentsResult, zonalResult].find(result => result.error);
    if (failure) throw dbError(failure.error);
    const roles = new Map(usersResult.data.map(user => [user.id, user.rol]));
    const courseNames = new Map(coursesResult.data.map(course => [course.id, course.nombre]));
    return {
      courses: coursesResult.data.map(course => course.nombre),
      training: trainingResult.data.filter(row => courseNames.has(row.curso_id)).map(row => ({
        storeId: dashboardId.get(row.tienda_id), role: roles.get(row.usuario_id) || '',
        course: courseNames.get(row.curso_id), state: row.estado,
      })),
      departures: usersResult.data.filter(user => user.fecha_salida && user.motivo_salida).map(user => ({
        storeId: dashboardId.get(user.tienda_id), date: user.fecha_salida, reason: user.motivo_salida,
      })),
      incidents: [
        ...incidentsResult.data.map(row => ({ storeId: dashboardId.get(row.tienda_id), date: row.fecha?.slice(0, 10), type: row.tipo })),
        ...zonalResult.data.filter(row => row.alcance !== 'entre_tiendas').map(row => ({
          storeId: dashboardId.get(row.tienda_afectada_id || row.tienda_origen_id), date: row.fecha, type: row.tipo,
        })),
      ],
    };
  }

  async function commercialStoreGoals(sessionUser) {
    const access = await currentCommercialAccess(sessionUser);
    const { data: mappings, error: mappingError } = await supabase.from("commercial_store_map")
      .select("dashboard_store_id,tienda_id").in("dashboard_store_id", access.storeIds);
    if (mappingError) throw dbError(mappingError);
    const stores = (mappings || []).filter(row => row.tienda_id != null);
    if (!stores.length) return { goals: [] };
    const dashboardByStore = new Map(stores.map(row => [Number(row.tienda_id), row.dashboard_store_id]));
    const [goalsResult, annualResult] = await Promise.all([
      supabase.from("metas_comerciales_tienda")
        .select("tienda_id,anio,mes,rubro,meta_venta,actualizado_en")
        .in("tienda_id", [...dashboardByStore.keys()]).order("anio").order("mes"),
      supabase.from("metas_comerciales_anuales").select("anio,meta_venta,actualizado_en").order("anio"),
    ]);
    let goalRows = goalsResult.data || []; let annualRows = annualResult.data || [];
    if (missingCentralGoalsSchema(goalsResult.error) || missingCentralGoalsSchema(annualResult.error)) {
      const [legacyResult, document] = await Promise.all([
        supabase.from("metas_comerciales_tienda").select("tienda_id,anio,mes,meta_venta,actualizado_en")
          .in("tienda_id", [...dashboardByStore.keys()]).order("anio").order("mes"),
        readCommercialGoalsDocument(),
      ]);
      if (legacyResult.error) throw dbError(legacyResult.error);
      const merged = new Map((legacyResult.data || []).map(row => [`${row.tienda_id}|${row.anio}|${row.mes}|`, { ...row, rubro: "" }]));
      for (const row of document.goals || []) merged.set(`${row.tienda_id}|${row.anio}|${row.mes}|${row.rubro || ""}`, row);
      goalRows = [...merged.values()]; annualRows = document.annualTargets || [];
    } else if (goalsResult.error || annualResult.error) throw dbError(goalsResult.error || annualResult.error);
    // Los archivos publicados ya están cargados en el cliente. Consultarlos de
    // nuevo aquí obliga a descargar y descomprimir todo dashboard.json en cada
    // arranque frío. Solo se usan como fallback si falta el plan central.
    const published = !goalRows.length || !annualRows.length
      ? await commercialCompanyRanking(sessionUser, true)
      : { monthlyStore: [], monthlyCategoryTarget: [] };
    const mergedGoals = new Map();
    for (const row of published.monthlyStore || []) {
      if (!access.storeIds.includes(row.storeId) || row.target == null) continue;
      mergedGoals.set(`${row.storeId}|${row.periodId}|`, { storeId: row.storeId, periodId: Number(row.periodId), target: Number(row.target), source: "PUBLICACION" });
    }
    for (const row of published.monthlyCategoryTarget || []) {
      const category = cleanText(row.category).toUpperCase();
      if (!access.storeIds.includes(row.storeId) || !["TEXTIL", "CALZADO"].includes(category) || row.target == null) continue;
      mergedGoals.set(`${row.storeId}|${row.periodId}|${category}`, { storeId: row.storeId, periodId: Number(row.periodId), category, target: Number(row.target), source: row.source || "PUBLICACION" });
    }
    for (const row of goalRows) {
      const goal = {
      storeId: dashboardByStore.get(Number(row.tienda_id)), periodId: Number(row.anio) * 100 + Number(row.mes),
      category: cleanText(row.rubro) || undefined, target: Number(row.meta_venta), updatedAt: row.actualizado_en,
      };
      if (goal.storeId) mergedGoals.set(`${goal.storeId}|${goal.periodId}|${goal.category || ""}`, goal);
    }
    const annualTargets = new Map();
    for (const goal of mergedGoals.values()) if (!goal.category) {
      const year = Math.floor(goal.periodId / 100); const current = annualTargets.get(year);
      annualTargets.set(year, (typeof current === "number" ? current : current?.target || 0) + goal.target);
    }
    for (const row of annualRows) annualTargets.set(Number(row.anio), { year: Number(row.anio), target: Number(row.meta_venta), updatedAt: row.actualizado_en });
    const categoryYears = [...new Set([...mergedGoals.values()].filter(goal => goal.category).map(goal => Math.floor(goal.periodId / 100)))];
    for (const year of categoryYears) {
      const aggregate = aggregateCommercialGoalTotals([...mergedGoals.values()].filter(goal => goal.category).map(goal => ({
        tienda_id: stores.find(store => store.dashboard_store_id === goal.storeId)?.tienda_id,
        anio: Math.floor(goal.periodId / 100), mes: goal.periodId % 100,
        rubro: goal.category, meta_venta: goal.target,
      })), year, null);
      for (const total of aggregate.totalRows) {
        const storeId = dashboardByStore.get(Number(total.tienda_id));
        if (storeId) mergedGoals.set(`${storeId}|${year * 100 + total.mes}|`, {
          storeId, periodId: year * 100 + total.mes, target: total.meta_venta, source: "CALCULADO",
        });
      }
      if (aggregate.totalRows.length) annualTargets.set(year, { year, target: aggregate.annualTarget });
    }
    for (const [year, value] of annualTargets) if (typeof value === "number") annualTargets.set(year, { year, target: value });
    return { goals: [...mergedGoals.values()], annualTargets: [...annualTargets.values()].sort((a, b) => a.year - b.year) };
  }

  const commercialGoalsDocumentPath = "configuracion/metas-comerciales.json";
  const missingCentralGoalsSchema = (error) => !!error && ["42703", "PGRST204", "PGRST205"].includes(error.code);

  async function readCommercialGoalsDocument() {
    const { data, error } = await supabase.storage.from("dashboard-data").download(commercialGoalsDocumentPath);
    if (error) {
      if (String(error.message || "").toLowerCase().includes("not found") || Number(error.statusCode) === 404) return { goals: [], annualTargets: [] };
      throw httpError("No se pudo leer la configuración de metas comerciales.", 500);
    }
    try {
      const parsed = JSON.parse(await data.text());
      return { goals: Array.isArray(parsed.goals) ? parsed.goals : [], annualTargets: Array.isArray(parsed.annualTargets) ? parsed.annualTargets : [] };
    } catch { throw httpError("La configuración de metas comerciales no es válida.", 500); }
  }

  async function writeCommercialGoalsDocument(document) {
    const payload = Buffer.from(JSON.stringify({ version: 1, ...document }), "utf8");
    const { error } = await supabase.storage.from("dashboard-data").upload(commercialGoalsDocumentPath, payload, { contentType: "application/json", upsert: true });
    if (error) throw httpError("No se pudo guardar la configuración de metas comerciales.", 500);
  }

  function commercialGoalsYear(event, body = null) {
    const value = body?.anio ?? event.queryStringParameters?.anio ?? new Date().getFullYear();
    const year = Number(value);
    if (!Number.isInteger(year) || year < 2024 || year > 2100) throw httpError("El año de metas no es válido.", 400);
    return year;
  }

  async function commercialGoalStores() {
    const mappings = await fetchAllReportPages(supabase.from("commercial_store_map").select("tienda_id,dashboard_store_id").not("tienda_id", "is", null).order("tienda_id"));
    const storeIds = [...new Set(mappings.map(row => Number(row.tienda_id)).filter(Number.isInteger))];
    if (!storeIds.length) return [];
    const stores = await fetchAllReportPages(supabase.from("tiendas")
      .select("id,nombre,codigo,estado,cluster_id,cluster:clusters(nombre,codigo)").in("id", storeIds).order("nombre"));
    const dashboardIds = new Map(mappings.map(row => [Number(row.tienda_id), row.dashboard_store_id]));
    return stores.map(({ cluster, ...store }) => ({
      ...store, dashboard_store_id: dashboardIds.get(Number(store.id)), cluster: cluster?.codigo || cluster?.nombre || "",
    }));
  }

  async function commercialGoalRubros() {
    return ["TEXTIL", "CALZADO"];
  }

  async function listCommercialGoals(event, sessionUser) {
    const year = commercialGoalsYear(event);
    const [stores, rubros, goalsResult, annual, published] = await Promise.all([
      commercialGoalStores(), commercialGoalRubros(), supabase.from("metas_comerciales_tienda")
        .select("tienda_id,anio,mes,rubro,meta_venta,actualizado_en").eq("anio", year).order("tienda_id").order("mes"),
      supabase.from("metas_comerciales_anuales").select("anio,meta_venta,actualizado_en").eq("anio", year).maybeSingle(),
      commercialCompanyRanking(sessionUser, true),
    ]);
    let goals = goalsResult.data || []; let annualTarget = annual.data?.meta_venta ?? "";
    if (missingCentralGoalsSchema(goalsResult.error) || missingCentralGoalsSchema(annual.error)) {
      const [legacy, document] = await Promise.all([
        supabase.from("metas_comerciales_tienda").select("tienda_id,anio,mes,meta_venta,actualizado_en").eq("anio", year).order("tienda_id").order("mes"),
        readCommercialGoalsDocument(),
      ]);
      if (legacy.error) throw dbError(legacy.error);
      const merged = new Map((legacy.data || []).map(row => [`${row.tienda_id}|${row.mes}|`, { ...row, rubro: "" }]));
      for (const row of (document.goals || []).filter(row => Number(row.anio) === year)) merged.set(`${row.tienda_id}|${row.mes}|${row.rubro || ""}`, row);
      goals = [...merged.values()]; annualTarget = (document.annualTargets || []).find(row => Number(row.anio) === year)?.meta_venta ?? "";
    } else if (goalsResult.error || annual.error) throw dbError(goalsResult.error || annual.error);
    const allowed = new Set(stores.map(store => Number(store.id))); const internalByDashboard = new Map(stores.map(store => [store.dashboard_store_id, Number(store.id)]));
    const merged = new Map();
    for (const row of published.monthlyStore || []) {
      const storeId = internalByDashboard.get(row.storeId); const periodId = Number(row.periodId);
      if (!storeId || Math.floor(periodId / 100) !== year || row.target == null) continue;
      merged.set(`${storeId}|${periodId % 100}|`, { tienda_id: storeId, anio: year, mes: periodId % 100, rubro: "", meta_venta: Number(row.target), fuente: "PUBLICACION" });
    }
    for (const row of published.monthlyCategoryTarget || []) {
      const storeId = internalByDashboard.get(row.storeId); const periodId = Number(row.periodId); const category = cleanText(row.category).toUpperCase();
      if (!storeId || Math.floor(periodId / 100) !== year || !["TEXTIL", "CALZADO"].includes(category) || row.target == null) continue;
      merged.set(`${storeId}|${periodId % 100}|${category}`, { tienda_id: storeId, anio: year, mes: periodId % 100, rubro: category, meta_venta: Number(row.target), fuente: row.source || "PUBLICACION" });
    }
    for (const row of goals.filter(row => allowed.has(Number(row.tienda_id)))) merged.set(`${row.tienda_id}|${row.mes}|${cleanText(row.rubro)}`, row);
    const aggregate = aggregateCommercialGoalTotals([...merged.values()], year, null);
    if (aggregate.totalRows.length) {
      for (const row of aggregate.totalRows) merged.set(`${row.tienda_id}|${row.mes}|`, { ...row, fuente: "CALCULADO" });
      annualTarget = aggregate.annualTarget;
    } else if (annualTarget === "" || annualTarget == null) {
      annualTarget = [...merged.values()].filter(row => !cleanText(row.rubro)).reduce((sum, row) => sum + Number(row.meta_venta || 0), 0);
    }
    return {
      anio: year, stores, rubros, meta_anual: annualTarget,
      metas: [...merged.values()],
    };
  }

  async function saveCommercialGoals(event, user) {
    const data = bodyOf(event); const year = commercialGoalsYear(event, data);
    if (year <= 2025) throw httpError("Las metas de 2024 y 2025 son históricas y no se pueden modificar.", 409);
    const rubro = normalizeGoalRubro(data.rubro);
    if (!rubro) throw httpError("Solo se pueden editar metas de TEXTIL o CALZADO.", 400);
    if (!Array.isArray(data.metas)) throw httpError("Las metas mensuales no son válidas.", 400);
    const stores = await commercialGoalStores(); const allowedStores = new Set(stores.map(store => Number(store.id)));
    const published = await commercialCompanyRanking(user, true); const internalByDashboard = new Map(stores.map(store => [store.dashboard_store_id, Number(store.id)]));
    const publishedCategoryRows = (published.monthlyCategoryTarget || []).filter(row => Math.floor(Number(row.periodId) / 100) === year
      && ["TEXTIL", "CALZADO"].includes(cleanText(row.category).toUpperCase()) && internalByDashboard.has(row.storeId)).map(row => ({
        tienda_id: internalByDashboard.get(row.storeId), anio: year, mes: Number(row.periodId) % 100,
        rubro: cleanText(row.category).toUpperCase(), meta_venta: Number(row.target) || 0,
      }));
    const categoryRowsWithPublishedBase = (savedRows) => {
      const merged = new Map(publishedCategoryRows.map(row => [`${row.tienda_id}|${row.mes}|${row.rubro}`, row]));
      for (const row of savedRows || []) {
        const category = cleanText(row.rubro).toUpperCase();
        if (Number(row.anio) === year && ["TEXTIL", "CALZADO"].includes(category)) merged.set(`${row.tienda_id}|${row.mes}|${category}`, { ...row, rubro: category });
      }
      return [...merged.values()];
    };
    const seen = new Set(); const rows = [];
    for (const row of data.metas) {
      const storeId = Number(row.tienda_id); const month = Number(row.mes); const key = `${storeId}|${month}`;
      if (!allowedStores.has(storeId)) throw httpError("Una de las tiendas no pertenece al dashboard comercial.", 400);
      if (!Number.isInteger(month) || month < 1 || month > 12 || seen.has(key)) throw httpError("Los meses enviados no son válidos.", 400);
      seen.add(key);
      if (row.meta_venta === "" || row.meta_venta == null) continue;
      const target = Number(row.meta_venta);
      if (!Number.isFinite(target) || target < 0 || target > 999999999999.99) throw httpError(`La meta del mes ${month} no es válida.`, 400);
      rows.push({ tienda_id: storeId, anio: year, mes: month, rubro, meta_venta: Math.round(target * 100) / 100,
        actualizado_por: user.id, actualizado_en: new Date().toISOString() });
    }
    const schemaCheck = await supabase.from("metas_comerciales_tienda").select("rubro").limit(1);
    if (missingCentralGoalsSchema(schemaCheck.error)) {
      const document = await readCommercialGoalsDocument(); const now = new Date().toISOString();
      document.goals = (document.goals || []).filter(row => Number(row.anio) !== year || cleanText(row.rubro) !== rubro)
        .concat(rows.map(row => ({ ...row, actualizado_en: now })));
      const aggregate = aggregateCommercialGoalTotals(categoryRowsWithPublishedBase(document.goals), year, user.id, now);
      document.goals = document.goals.filter(row => Number(row.anio) !== year || cleanText(row.rubro) !== "").concat(aggregate.totalRows);
      document.annualTargets = (document.annualTargets || []).filter(row => Number(row.anio) !== year)
        .concat([{ anio: year, meta_venta: aggregate.annualTarget, actualizado_por: user.id, actualizado_en: now }]);
      await writeCommercialGoalsDocument(document);
      return listCommercialGoals({ queryStringParameters: { anio: String(year) } }, user);
    }
    if (schemaCheck.error) throw dbError(schemaCheck.error);
    const removed = await supabase.from("metas_comerciales_tienda").delete().eq("anio", year).eq("rubro", rubro);
    if (removed.error) throw dbError(removed.error);
    for (let index = 0; index < rows.length; index += 500) {
      const { error } = await supabase.from("metas_comerciales_tienda").insert(rows.slice(index, index + 500));
      if (error) throw dbError(error);
    }
    return listCommercialGoals({ queryStringParameters: { anio: String(year) } }, user);
  }

  let publishedReleaseCache = null;
  let publishedReleasePromise = null;
  const commercialFileMetadataCache = new Map();
  const localPreviewReleaseVersion = process.env.CONTEXT === "dev"
    && /^\d{8}T\d{6}Z-[0-9a-f]{12}$/.test(process.env.DASHBOARD_PREVIEW_RELEASE_VERSION || "")
    ? process.env.DASHBOARD_PREVIEW_RELEASE_VERSION : null;

  async function publishedCommercialRelease() {
    if (publishedReleaseCache?.expires > Date.now()) return publishedReleaseCache.value;
    if (publishedReleasePromise) return publishedReleasePromise;
    publishedReleasePromise = (async () => {
    let query = supabase.from("dashboard_releases")
      .select("id,version,sales_cutoff,stock_cutoff,published_at");
    query = localPreviewReleaseVersion
      ? query.eq("version", localPreviewReleaseVersion).eq("status", "staging")
      : query.eq("status", "published").order("published_at", { ascending: false });
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw httpError("Todavía no hay una publicación comercial disponible.", 404);
    publishedReleaseCache = { value: data, expires: Date.now() + 15_000 };
    return data;
    })();
    try { return await publishedReleasePromise; }
    finally { publishedReleasePromise = null; }
  }

  async function commercialFileRows(releaseId, access, logicalName = null) {
    const cacheKey = `${releaseId}:${access.scopeType}:${access.scopeValue || "all"}:${logicalName || "*"}`;
    const cached = commercialFileMetadataCache.get(cacheKey);
    if (cached?.expires > Date.now()) return cached.value || cached.promise;
    const table = access.scopeType === "all" ? "dashboard_files" : "dashboard_scope_files";
    const promise = (async () => {
      let query = supabase.from(table).select("logical_name,checksum_sha256,parts")
        .eq("release_id", releaseId);
      if (access.scopeType !== "all") {
        query = query.eq("scope_type", access.scopeType).eq("scope_value", access.scopeValue);
      }
      if (logicalName) query = query.eq("logical_name", logicalName);
      const { data, error } = await query;
      if (error) throw dbError(error);
      return data || [];
    })();
    commercialFileMetadataCache.set(cacheKey, { promise, expires: Date.now() + 60_000 });
    try {
      const value = await promise;
      commercialFileMetadataCache.set(cacheKey, { value, expires: Date.now() + 60_000 });
      if (commercialFileMetadataCache.size > 200) {
        for (const [key, entry] of commercialFileMetadataCache) if (entry.expires <= Date.now()) commercialFileMetadataCache.delete(key);
      }
      return value;
    } catch (error) {
      commercialFileMetadataCache.delete(cacheKey);
      throw error;
    }
  }

  async function commercialManifest(sessionUser) {
    const access = await currentCommercialAccess(sessionUser);
    const release = await publishedCommercialRelease();
    const files = await commercialFileRows(release.id, access);
    if (!files.length) throw httpError("La publicación comercial no contiene archivos para este alcance.", 503);
    return { release, access, files: files.map(row => row.logical_name) };
  }

  async function commercialFileSource(sessionUser, logicalName) {
    if (!/^dashboard(?:-[a-z0-9-]+)?\.json$/.test(logicalName)) throw httpError("Archivo comercial no válido.", 400);
    const access = await currentCommercialAccess(sessionUser);
    const release = await publishedCommercialRelease();
    const rows = await commercialFileRows(release.id, access, logicalName);
    const file = rows[0];
    if (!file?.parts?.length) throw httpError("El archivo no está disponible para esta cuenta.", 404);
    const paths = file.parts.map(part => part.path);
    // Una versión puede reutilizar partes inmutables de publicaciones previas.
    // La ruta debe conservar siempre el alcance y el nombre lógico autorizados.
    if (!paths.every(path => validCommercialPartPath(path, access, logicalName))) {
      throw httpError("La ruta del archivo comercial no coincide con los permisos del usuario.", 503);
    }
    const { data, error } = await supabase.storage.from("dashboard-data").createSignedUrls(paths, 300);
    if (error || !data || data.some(item => !item.signedUrl)) throw dbError(error || new Error("No se pudieron firmar todas las partes."));
    return {
      urls: data.map(item => item.signedUrl),
      encoding: file.parts.every(part => part.encoding === "gzip") ? "gzip" : "identity",
      cacheKey: `${access.scopeType}:${access.scopeValue || "all"}:${logicalName}:${file.checksum_sha256}`,
      cacheVersion: release.version,
      cacheEnabled: true,
    };
  }

  async function commercialStoreTransfers(sessionUser) {
    const access = await currentCommercialAccess(sessionUser);
    if (access.scopeType !== 'store') throw httpError('Esta consulta requiere una tienda asignada.', 403);
    const release = await publishedCommercialRelease();
    const allAccess = { scopeType: 'all' };
    let logicalName = 'dashboard-stock-transfers.json';
    let rows = await commercialFileRows(release.id, allAccess, logicalName);
    if (!rows.length) {
      logicalName = 'dashboard-stock-products.json';
      rows = await commercialFileRows(release.id, allAccess, logicalName);
    }
    if (!rows.length) {
      logicalName = 'dashboard-stock.json';
      rows = await commercialFileRows(release.id, allAccess, logicalName);
    }
    const parts = rows[0]?.parts || [];
    if (!parts.length || !parts.every(part => validCommercialPartPath(part.path, allAccess, logicalName))) {
      throw httpError('El detalle de traslados no está disponible.', 503);
    }
    const chunks = await Promise.all(parts.map(async part => {
      const result = await supabase.storage.from('dashboard-data').download(part.path);
      if (result.error || !result.data) throw httpError('No se pudo leer el detalle de traslados.', 503);
      return Buffer.from(await result.data.arrayBuffer());
    }));
    const bytes = Buffer.concat(chunks);
    const payload = JSON.parse((parts.every(part => part.encoding === 'gzip') ? gunzipSync(bytes) : bytes).toString('utf8'));
    const value = storeTransferOpportunities(payload.stockCompact || payload.stockProducts, access.storeIds);
    const ranking = await commercialCompanyRanking(sessionUser);
    const involved = new Set(value.routes.flatMap(row => [row.source, row.destination]));
    return { ...value, stores: ranking.stores.filter(store => involved.has(store.storeId)) };
  }

  let companyRankingCache = null;
  async function commercialCompanyRanking(sessionUser, includeGoalDetails = false) {
    await currentCommercialAccess(sessionUser);
    const release = await publishedCommercialRelease();
    const responseValue = value => {
      if (includeGoalDetails) return value;
      const publicValue = { ...value }; delete publicValue.monthlyCategoryTarget; return publicValue;
    };
    if (companyRankingCache?.version === release.version) return responseValue(companyRankingCache.value);
    const rows = await commercialFileRows(release.id, { scopeType: 'all' }, 'dashboard.json');
    const parts = rows[0]?.parts || [];
    if (!parts.length || !parts.every(part => validCommercialPartPath(part.path, { scopeType: 'all' }, 'dashboard.json'))) {
      throw httpError('El ranking general no está disponible.', 503);
    }
    const chunks = await Promise.all(parts.map(async part => {
      const result = await supabase.storage.from('dashboard-data').download(part.path);
      if (result.error || !result.data) throw httpError('No se pudo leer el ranking general.', 503);
      const bytes = Buffer.from(await result.data.arrayBuffer());
      return part.encoding === 'gzip' ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
    }));
    const dashboard = JSON.parse(chunks.join(''));
    const value = {
      stores: (dashboard.stores || []).filter(store => store.isStore).map(store => ({
        storeId: store.storeId, store: store.store, alias: store.alias, isStore: true,
        format: store.format, cluster: store.cluster, areaM2: store.areaM2, capacity: store.capacity,
        status: store.status, openingDate: store.openingDate, closingDate: store.closingDate,
      })),
      monthlyStore: (dashboard.monthlyStore || []).map(row => ({ periodId: row.periodId, storeId: row.storeId,
        gross: row.gross, positiveReal: row.positiveReal, net: row.net, transactions: row.transactions, target: row.target })),
      monthlyCategoryTarget: (dashboard.monthlyCategoryTarget || []).map(row => ({ periodId: row.periodId, storeId: row.storeId,
        category: row.category, target: row.target, source: row.source })),
      salesCutoff: release.sales_cutoff,
      predictiveStore: (dashboard.predictiveStore || []).map(row => ({ storeId: row.storeId,
        rotation: row.rotation, stockValue: row.stockValue, sales30: row.sales30 })),
    };
    companyRankingCache = { version: release.version, value };
    return responseValue(value);
  }

  return { currentCommercialAccess, commercialOperationalSummary, commercialStoreGoals, listCommercialGoals, saveCommercialGoals, publishedCommercialRelease, commercialManifest, commercialFileSource, commercialCompanyRanking, commercialStoreTransfers };
}
