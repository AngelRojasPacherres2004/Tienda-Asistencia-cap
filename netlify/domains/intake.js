export function createIntakeDomain({
  allowedAnnualStores, ANNUAL_DETAIL_COLUMNS, ANNUAL_REPORT_KINDS,
  annualMonthlyReportPath, annualMonthlySummaryPath, annualReportPath,
  annualSummaryPath, bodyOf, buildAnnualSummaryWorkbook,
  COMMERCIAL_BATCH_MAX_BYTES, COMMERCIAL_BATCH_SOURCES,
  commercialAssistantMessages, commercialBatchPath, commercialBatchSources,
  currentCommercialAccess, dbError, excelResponse, gunzipSync, httpError,
  join, jwt, jwtSecret, NORMALIZED_REPORTS, normalizedReportPath,
  parseAnnualFilters, publishedCommercialRelease, randomUUID, readFile,
  resolve, summarizeAnnualReports, supabase, SYSTEM_SOURCES,
  SYSTEM_UPLOAD_CHUNK_SIZE, systemManifestPath, systemPartPath,
  validateBatchId, validateCutoff, validateSystemUpload,
}) {
  const systemsStorage = () => supabase.storage.from("dashboard-data");

  async function assertSystemsUser(sessionUser) {
    if (sessionUser.rol !== "sistemas") throw httpError("Solo el rol Sistemas puede cargar archivos.", 403);
    const { data, error } = await supabase.from("usuarios").select("rol,estado")
      .eq("id", sessionUser.id).maybeSingle();
    if (error) throw dbError(error);
    if (data?.rol !== "sistemas" || data.estado !== "activo") {
      throw httpError("Tu usuario de Sistemas ya no está activo.", 403);
    }
  }

  async function systemUploadStart(event, sessionUser) {
    await assertSystemsUser(sessionUser);
    const input = bodyOf(event);
    let validated;
    try { validated = validateSystemUpload(input); }
    catch (error) { throw httpError(error.message, 400); }
    const uploadId = randomUUID();
    const parts = [];
    // El bucket privado limita cada objeto a 6 MB; cada parte queda por debajo de ese tope.
    for (let offset = 0; offset < validated.chunks; offset += 8) {
      const batch = await Promise.all(Array.from({ length: Math.min(8, validated.chunks - offset) }, (_, position) => {
        const index = offset + position;
        return systemsStorage().createSignedUploadUrl(systemPartPath(uploadId, index));
      }));
      for (const result of batch) {
        if (result.error || !result.data?.signedUrl) {
          console.error("No se pudo firmar una parte de la carga:", result.error?.message);
          throw httpError("No se pudo preparar la carga. Intenta nuevamente.", 503);
        }
        parts.push(result.data.signedUrl);
      }
    }
    const receipt = jwt.sign({ purpose: "systems-upload", userId: sessionUser.id,
      uploadId, source: input.source, fileName: input.fileName.trim(), fileSize: input.fileSize,
      chunks: validated.chunks }, jwtSecret(), { expiresIn: "2h" });
    return { uploadId, chunkSize: SYSTEM_UPLOAD_CHUNK_SIZE, parts, receipt };
  }

  async function systemUploadComplete(event, sessionUser) {
    await assertSystemsUser(sessionUser);
    const ticket = systemUploadTicket(bodyOf(event).receipt, sessionUser);
    let validated;
    try { validated = validateSystemUpload(ticket); }
    catch { throw httpError("Los datos de la carga no son válidos.", 400); }
    if (validated.chunks !== ticket.chunks) throw httpError("La cantidad de partes no coincide.", 400);
    const paths = Array.from({ length: ticket.chunks }, (_, index) => systemPartPath(ticket.uploadId, index));
    for (let offset = 0; offset < paths.length; offset += 8) {
      const batch = await Promise.all(paths.slice(offset, offset + 8).map(path => systemsStorage().info(path)));
      for (let position = 0; position < batch.length; position += 1) {
        const index = offset + position;
        const expected = Math.min(SYSTEM_UPLOAD_CHUNK_SIZE, ticket.fileSize - index * SYSTEM_UPLOAD_CHUNK_SIZE);
        if (batch[position].error || Number(batch[position].data?.size) !== expected) {
          throw httpError(`La parte ${index + 1} no llegó completa. Reintenta la carga.`, 409);
        }
      }
    }
    const manifest = { id: ticket.uploadId, source: ticket.source,
      sourceLabel: validated.definition.label, fileName: ticket.fileName, fileSize: ticket.fileSize,
      chunkSize: SYSTEM_UPLOAD_CHUNK_SIZE, parts: paths, uploadedBy: sessionUser.id,
      receivedAt: new Date().toISOString(), status: "received" };
    const { error } = await systemsStorage().upload(systemManifestPath(ticket.uploadId),
      Buffer.from(JSON.stringify(manifest)), { contentType: "application/json", upsert: false });
    if (error) {
      if (String(error.statusCode) === "409") throw httpError("Esta carga ya fue registrada.", 409);
      console.error("No se pudo registrar la carga:", error.message);
      throw httpError("Se recibieron las partes, pero no se pudo registrar la carga.", 503);
    }
    return { upload: manifest };
  }

  function systemUploadTicket(receipt, sessionUser) {
    let ticket;
    try { ticket = jwt.verify(receipt, jwtSecret()); }
    catch { throw httpError("La carga expiró. Vuelve a seleccionar el archivo.", 400); }
    if (ticket.purpose !== "systems-upload" || ticket.userId !== sessionUser.id) {
      throw httpError("Esta carga no pertenece a tu usuario.", 403);
    }
    return ticket;
  }

  async function systemUploadCancel(event, sessionUser) {
    await assertSystemsUser(sessionUser);
    const ticket = systemUploadTicket(bodyOf(event).receipt, sessionUser);
    let validated;
    try { validated = validateSystemUpload(ticket); }
    catch { throw httpError("Los datos de la carga no son válidos.", 400); }
    if (validated.chunks !== ticket.chunks) throw httpError("La cantidad de partes no coincide.", 400);
    const { data } = await systemsStorage().info(systemManifestPath(ticket.uploadId));
    if (data) throw httpError("La carga ya fue registrada y no puede cancelarse.", 409);
    const paths = Array.from({ length: ticket.chunks }, (_, index) => systemPartPath(ticket.uploadId, index));
    const { error } = await systemsStorage().remove(paths);
    if (error) throw httpError("No se pudieron limpiar las partes incompletas.", 503);
    return { ok: true };
  }

  async function systemUploadsList(sessionUser) {
    await assertSystemsUser(sessionUser);
    const { data, error } = await systemsStorage().list("intake-manifests", {
      limit: 30, sortBy: { column: "created_at", order: "desc" },
    });
    if (error) throw httpError("No se pudo consultar el historial de cargas.", 503);
    const rows = (await Promise.all((data || []).filter(item => item.name.endsWith(".json"))
      .map(async item => {
        const result = await systemsStorage().download(`intake-manifests/${item.name}`);
        if (result.error || !result.data) return null;
        try {
          const { id, source, sourceLabel, fileName, fileSize, receivedAt, status } = JSON.parse(await result.data.text());
          return { id, source, sourceLabel, fileName, fileSize, receivedAt, status };
        } catch { return null; }
      }))).filter(Boolean);
    return { sources: SYSTEM_SOURCES, uploads: rows };
  }

  async function assertBatchPublisher(sessionUser) {
    await assertSystemsUser(sessionUser);
  }

  function commercialBatchTicket(receipt, sessionUser) {
    let ticket;
    try { ticket = jwt.verify(receipt, jwtSecret()); }
    catch { throw httpError("La carga expiró. Vuelve a seleccionar los archivos.", 400); }
    if (ticket.purpose !== "commercial-batch-upload" || ticket.userId !== sessionUser.id) {
      throw httpError("Esta carga no pertenece a tu usuario.", 403);
    }
    return ticket;
  }

  async function commercialBatchStart(event, sessionUser) {
    await assertBatchPublisher(sessionUser);
    const input = bodyOf(event);
    try {
      validateBatchId(input.batchId);
      validateCutoff(input.cutoff);
      if (!COMMERCIAL_BATCH_SOURCES.some(item => item.id === input.source)) throw new Error("Fuente RMS no válida.");
    } catch (error) { throw httpError(error.message, 400); }
    let validated;
    try { validated = validateSystemUpload(input); }
    catch (error) { throw httpError(error.message, 400); }
    const { data: registeredBatch } = await systemsStorage().info(commercialBatchPath(input.batchId));
    if (registeredBatch) throw httpError("El lote ya fue registrado.", 409);
    const uploadId = randomUUID();
    const parts = [];
    for (let offset = 0; offset < validated.chunks; offset += 8) {
      const results = await Promise.all(Array.from({ length: Math.min(8, validated.chunks - offset) }, (_, position) =>
        systemsStorage().createSignedUploadUrl(systemPartPath(uploadId, offset + position))));
      for (const result of results) {
        if (result.error || !result.data?.signedUrl) throw httpError("No se pudo preparar la carga RMS.", 503);
        parts.push(result.data.signedUrl);
      }
    }
    const receipt = jwt.sign({ purpose: "commercial-batch-upload", userId: sessionUser.id,
      batchId: input.batchId, cutoff: input.cutoff, uploadId, source: input.source,
      fileName: input.fileName.trim(), fileSize: input.fileSize, chunks: validated.chunks },
    jwtSecret(), { expiresIn: "3h" });
    return { chunkSize: SYSTEM_UPLOAD_CHUNK_SIZE, parts, receipt };
  }

  async function commercialBatchComplete(event, sessionUser) {
    await assertBatchPublisher(sessionUser);
    const input = bodyOf(event);
    const receipts = Array.isArray(input.receipts) ? input.receipts : [];
    const tickets = receipts.map(receipt => commercialBatchTicket(receipt, sessionUser));
    try {
      commercialBatchSources(tickets);
      tickets.forEach(ticket => { validateBatchId(ticket.batchId); validateCutoff(ticket.cutoff); });
    } catch (error) { throw httpError(error.message, 400); }
    const { batchId, cutoff } = tickets[0];
    if (tickets.some(ticket => ticket.batchId !== batchId || ticket.cutoff !== cutoff)) {
      throw httpError("Los archivos pertenecen a lotes o fechas diferentes.", 400);
    }
    if (tickets.reduce((total, ticket) => total + ticket.fileSize, 0) > COMMERCIAL_BATCH_MAX_BYTES) {
      throw httpError("El lote completo supera 300 MB.", 400);
    }
    const { data: existing } = await systemsStorage().info(commercialBatchPath(batchId));
    if (existing) throw httpError("Este lote ya se registró.", 409);
    const files = [];
    for (const ticket of tickets) {
      let validated;
      try { validated = validateSystemUpload(ticket); }
      catch (error) { throw httpError(error.message, 400); }
      if (ticket.chunks !== validated.chunks) throw httpError("La cantidad de partes no coincide.", 400);
      const paths = Array.from({ length: ticket.chunks }, (_, index) => systemPartPath(ticket.uploadId, index));
      for (let offset = 0; offset < paths.length; offset += 8) {
        const results = await Promise.all(paths.slice(offset, offset + 8).map(path => systemsStorage().info(path)));
        for (let index = 0; index < results.length; index += 1) {
          const expected = Math.min(SYSTEM_UPLOAD_CHUNK_SIZE, ticket.fileSize - (offset + index) * SYSTEM_UPLOAD_CHUNK_SIZE);
          if (results[index].error || Number(results[index].data?.size) !== expected) {
            throw httpError(`Falta una parte del archivo ${ticket.source}. Vuelve a cargar el lote.`, 409);
          }
        }
      }
      files.push({ source: ticket.source, fileName: ticket.fileName, fileSize: ticket.fileSize,
        chunkSize: SYSTEM_UPLOAD_CHUNK_SIZE, parts: paths });
    }
    const manifest = { id: batchId, cutoff, files, uploadedBy: sessionUser.id,
      receivedAt: new Date().toISOString(), status: "pending_processing" };
    const { error } = await systemsStorage().upload(commercialBatchPath(batchId),
      Buffer.from(JSON.stringify(manifest)), { contentType: "application/json", upsert: false });
    if (error) throw httpError("Los archivos llegaron, pero no se pudo registrar el lote.", 503);
    return { batch: { id: batchId, cutoff, files: files.map(({ source, fileName, fileSize }) => ({ source, fileName, fileSize })),
      receivedAt: manifest.receivedAt, status: manifest.status } };
  }

  async function commercialBatchCancel(event, sessionUser) {
    await assertBatchPublisher(sessionUser);
    const tickets = (Array.isArray(bodyOf(event).receipts) ? bodyOf(event).receipts : [])
      .map(receipt => commercialBatchTicket(receipt, sessionUser));
    if (!tickets.length || tickets.length > COMMERCIAL_BATCH_SOURCES.length) throw httpError("Lote no válido.", 400);
    const batchId = tickets[0].batchId;
    if (tickets.some(ticket => ticket.batchId !== batchId)) throw httpError("Lote no válido.", 400);
    const { data: existing } = await systemsStorage().info(commercialBatchPath(batchId));
    if (existing) throw httpError("El lote ya fue registrado.", 409);
    const paths = tickets.flatMap(ticket => Array.from({ length: ticket.chunks }, (_, index) => systemPartPath(ticket.uploadId, index)));
    for (let offset = 0; offset < paths.length; offset += 100) {
      const { error } = await systemsStorage().remove(paths.slice(offset, offset + 100));
      if (error) throw httpError("No se pudieron limpiar las partes incompletas.", 503);
    }
    return { ok: true };
  }

  async function commercialBatchesList(sessionUser) {
    await assertBatchPublisher(sessionUser);
    const { data, error } = await systemsStorage().list("commercial-intake", {
      limit: 20, sortBy: { column: "created_at", order: "desc" },
    });
    if (error) throw httpError("No se pudo consultar el historial de lotes.", 503);
    const batches = (await Promise.all((data || []).filter(item => item.name.endsWith(".json")).map(async item => {
      const result = await systemsStorage().download(`commercial-intake/${item.name}`);
      if (result.error || !result.data) return null;
      try {
        const { id, cutoff, files, receivedAt, status } = JSON.parse(await result.data.text());
        return { id, cutoff, files: files.map(({ source, fileName, fileSize }) => ({ source, fileName, fileSize })), receivedAt, status };
      } catch { return null; }
    }))).filter(Boolean);
    return { batches };
  }

  async function normalizedReportCatalog(sessionUser) {
    const access = await currentCommercialAccess(sessionUser);
    const release = await publishedCommercialRelease();
    const manifestPath = `commercial-reports/${release.version}/manifest.json`;
    const result = await systemsStorage().download(manifestPath);
    if (result.error || !result.data) {
      return { release: { version: release.version, salesCutoff: release.sales_cutoff, stockCutoff: release.stock_cutoff },
        reports: [], stores: [], ready: false };
    }
    let manifest;
    try { manifest = JSON.parse(await result.data.text()); }
    catch { throw httpError("El catálogo de reportes no se pudo leer.", 503); }
    if (manifest.releaseId !== release.id || manifest.version !== release.version || !Array.isArray(manifest.files)) {
      throw httpError("Los reportes no coinciden con la publicación comercial actual.", 503);
    }
    const kinds = access.role === "coach" ? ["ventas"] : NORMALIZED_REPORTS.map(item => item.id);
    const files = manifest.files.filter(file => kinds.includes(file.kind) && access.storeIds.includes(file.storeId)
      && file.path === normalizedReportPath(release.version, file.kind, file.storeId));
    const stores = [...new Set(files.map(file => file.storeId))].sort().map(storeId => ({
      id: storeId, name: manifest.storeNames?.[storeId] || storeId,
    }));
    return { release: { version: release.version, salesCutoff: release.sales_cutoff, stockCutoff: release.stock_cutoff },
      reports: NORMALIZED_REPORTS.filter(item => kinds.includes(item.id)).map(item => ({ ...item,
        stores: files.filter(file => file.kind === item.id).map(file => file.storeId) })),
      stores, ready: true };
  }

  async function normalizedReportLink() {
    // La ruta heredada firma CSV de un año completo; mientras se exijan descargas
    // mensuales no debe quedar como vía alternativa al límite del módulo actual.
    throw httpError("La descarga anual está temporalmente deshabilitada. Usa Análisis y cifras y selecciona un mes.", 410);
  }

  let annualManifestCache = null;
  async function annualReportManifest() {
    if (annualManifestCache && Date.now() < annualManifestCache.expires) return annualManifestCache.promise;
    const promise = loadAnnualReportManifest().catch(error => {
      if (annualManifestCache?.promise === promise) annualManifestCache = null;
      throw error;
    });
    annualManifestCache = { promise, expires: Date.now() + 30_000 };
    return promise;
  }

  async function loadAnnualReportManifest() {
    const release = await publishedCommercialRelease();
    // En local se prefiere la partición mensual; la versión anual sigue disponible como respaldo.
    const localDirectories = process.env.CONTEXT === "production" ? [] : [
      ...(process.env.ANNUAL_REPORTS_DIR ? [process.env.ANNUAL_REPORTS_DIR] : []),
      resolve(process.cwd(), "..", ".etl_work", `annual-reports-monthly-${release.sales_cutoff}-v3`),
      resolve(process.cwd(), "..", ".etl_work", `annual-reports-monthly-${release.sales_cutoff}`),
      resolve(process.cwd(), "..", ".etl_work", "annual-reports-monthly"),
      resolve(process.cwd(), "..", ".etl_work", "annual-reports"),
    ];
    for (const localDirectory of localDirectories) {
      try {
        const local = JSON.parse(await readFile(join(localDirectory, "manifest.json"), "utf8"));
        if (local.cutoffs?.ventas === release.sales_cutoff
          && local.cutoffs?.stock === release.stock_cutoff) {
          return { release, manifest: { ...local, version: release.version, releaseId: release.id }, localDirectory };
        }
      } catch { /* Sin archivos locales: consultar la publicación privada. */ }
    }
    let result = await systemsStorage().download(`commercial-annual-v3/${release.version}/manifest.json`);
    if (result.error || !result.data) result = await systemsStorage().download(`commercial-annual-v2/${release.version}/manifest.json`);
    if (result.error || !result.data) result = await systemsStorage().download(`commercial-annual/${release.version}/manifest.json`);
    if (result.error || !result.data) return { release, manifest: null, localDirectory: null };
    let manifest;
    try { manifest = JSON.parse(await result.data.text()); }
    catch { throw httpError("El catálogo anual no se pudo leer.", 503); }
    if (manifest.releaseId !== release.id || manifest.version !== release.version
      || !manifest.cutoffs?.ventas || !manifest.cutoffs?.stock
      || manifest.cutoffs.ventas > release.sales_cutoff || manifest.cutoffs.stock > release.stock_cutoff
      || !Array.isArray(manifest.files) || !Array.isArray(manifest.summaries)) {
      throw httpError("Los reportes anuales no corresponden al corte publicado.", 503);
    }
    return { release, manifest, localDirectory: null };
  }

  function annualKindAllowed(role, kind) {
    if (!ANNUAL_DETAIL_COLUMNS[kind]) throw httpError("Tipo de reporte no válido.", 400);
    if (role === "coach" && kind !== "ventas") throw httpError("Este reporte no corresponde a tu rol.", 403);
  }

  function annualFilters(query, manifest) {
    let filters;
    try { filters = parseAnnualFilters(query); }
    catch (error) { throw httpError(error.message, 400); }
    if (!manifest.years.includes(filters.year)) throw httpError("El año seleccionado aún no tiene reportes publicados.", 404);
    return filters;
  }

  function annualStores(access, manifest, filters) {
    const selected = allowedAnnualStores(access, manifest, filters);
    if (!selected) throw httpError("La tienda no corresponde a tu alcance.", 403);
    return selected;
  }

  async function annualReportCatalog(sessionUser) {
    const access = await currentCommercialAccess(sessionUser);
    const { release, manifest } = await annualReportManifest();
    if (!manifest) return { ready: false, release: { salesCutoff: release.sales_cutoff, stockCutoff: release.stock_cutoff } };
    const allowedStores = new Set(access.storeIds);
    const files = manifest.files.filter(item => allowedStores.has(item.storeId)
      && (access.role !== "coach" || item.kind === "ventas"));
    const years = [...new Set(files.map(item => item.year))].sort((a, b) => b - a);
    const initialDimensions = annualDimensionTuples(manifest, years[0], access.storeIds);
    return { ready: true, monthly: [2, 3].includes(manifest.schemaVersion), years, cutoffs: manifest.cutoffs,
      fileRows: files.map(({ year, kind, storeId, month, rows }) => ({ year, kind, storeId, month, rows })),
      reports: ANNUAL_REPORT_KINDS.filter(item => (access.role !== "coach" || item.id === "ventas")
        && files.some(file => file.kind === item.id && file.rows > 0))
        .map(item => ({ ...item, years: [...new Set(files.filter(file => file.kind === item.id).map(file => file.year))] })),
      stores: access.storeIds.filter(storeId => manifest.stores?.[storeId]).map(storeId => ({
        id: storeId, ...manifest.stores[storeId],
      })), initialDimensions };
  }

  function annualDimensionTuples(manifest, year, storeIds) {
    const tuples = new Set();
    for (const storeId of storeIds) {
      for (const tuple of manifest.dimensions?.[`${year}/${storeId}`] || []) tuples.add(JSON.stringify(tuple));
    }
    return [...tuples].map(tuple => JSON.parse(tuple));
  }

  async function annualReportDimensions(event, sessionUser) {
    const access = await currentCommercialAccess(sessionUser);
    const { manifest } = await annualReportManifest();
    if (!manifest) throw httpError("Los reportes anuales aún no están publicados.", 404);
    const filters = annualFilters(event.queryStringParameters, manifest);
    const selected = annualStores(access, manifest, filters);
    return { year: filters.year, dimensions: annualDimensionTuples(manifest, filters.year, selected) };
  }

  async function annualDetailLinks(event, sessionUser) {
    const access = await currentCommercialAccess(sessionUser);
    const { release, manifest, localDirectory } = await annualReportManifest();
    if (!manifest) throw httpError("Los reportes anuales aún no están publicados.", 404);
    const kind = event.queryStringParameters?.kind;
    annualKindAllowed(access.role, kind);
    const filters = annualFilters(event.queryStringParameters, manifest);
    if (!filters.month) throw httpError("Por ahora las descargas se realizan por mes. Selecciona un mes.", 400);
    if (![2, 3].includes(manifest.schemaVersion)) throw httpError("Los archivos mensuales aún no están preparados para este corte.", 503);
    const selected = annualStores(access, manifest, filters);
    if (!selected.length) throw httpError("No hay tiendas en el alcance seleccionado.", 404);
    const monthly = [2, 3].includes(manifest.schemaVersion);
    const matching = manifest.files.filter(item => item.kind === kind && item.year === filters.year
      && selected.includes(item.storeId) && (!monthly || item.month === filters.month)
      && item.path === (monthly ? `${filters.year}/${kind}/${item.storeId}/${String(item.month).padStart(2, "0")}.jsonl.gz`
        : `${filters.year}/${kind}/${item.storeId}.jsonl.gz`));
    if (!matching.length) throw httpError("No hay registros de esa fuente para el año y tiendas seleccionados.", 404);
    const files = matching.map(item => {
      const path = monthly ? annualMonthlyReportPath(release.version, item.year, item.kind, item.storeId, item.month, manifest.schemaVersion)
        : annualReportPath(release.version, item.year, item.kind, item.storeId);
      return { path, storeId: item.storeId, rows: item.rows,
        url: localDirectory
          ? `/api/commercial/annual-reports/local-file?year=${item.year}&kind=${kind}&storeId=${item.storeId}${monthly ? `&month=${item.month}` : ''}`
          : null };
    });
    if (!localDirectory) {
      for (let start = 0; start < files.length; start += 100) {
        const batch = files.slice(start, start + 100);
        const signed = await systemsStorage().createSignedUrls(batch.map(item => item.path), 1200);
        if (signed.error || signed.data?.length !== batch.length || signed.data.some(item => !item.signedUrl)) {
          throw httpError("No se pudo preparar el detalle anual.", 503);
        }
        batch.forEach((item, index) => { item.url = signed.data[index].signedUrl; });
      }
    }
    files.forEach(item => { delete item.path; });
    return { year: filters.year, kind, columns: ANNUAL_DETAIL_COLUMNS[kind], files };
  }

  async function annualLocalDetailFile(event, sessionUser) {
    const access = await currentCommercialAccess(sessionUser);
    const { manifest, localDirectory } = await annualReportManifest();
    if (!localDirectory || !manifest) throw httpError("Archivo local no disponible.", 404);
    const kind = event.queryStringParameters?.kind;
    annualKindAllowed(access.role, kind);
    const filters = annualFilters(event.queryStringParameters, manifest);
    const storeId = String(event.queryStringParameters?.storeId || "");
    if (!annualStores(access, manifest, { ...filters, storeId }).includes(storeId)) throw httpError("Tienda fuera de alcance.", 403);
    const monthly = [2, 3].includes(manifest.schemaVersion);
    if (!filters.month) throw httpError("Selecciona el mes del archivo.", 400);
    if (!monthly) throw httpError("Los archivos mensuales aún no están preparados para este corte.", 503);
    const item = manifest.files.find(file => file.kind === kind && file.year === filters.year && file.storeId === storeId
      && (!monthly || file.month === filters.month));
    if (!item || item.path !== (monthly ? `${filters.year}/${kind}/${storeId}/${String(filters.month).padStart(2, "0")}.jsonl.gz`
      : `${filters.year}/${kind}/${storeId}.jsonl.gz`)) throw httpError("Archivo no disponible.", 404);
    const data = await readFile(join(localDirectory, item.path));
    return { statusCode: 200, isBase64Encoded: true,
      headers: { "Content-Type": "application/gzip", "Cache-Control": "no-store" }, body: data.toString("base64") };
  }

  async function annualSummaryExcel(event, sessionUser) {
    const access = await currentCommercialAccess(sessionUser);
    const { release, manifest, localDirectory } = await annualReportManifest();
    if (!manifest) throw httpError("El resumen anual aún no está publicado.", 404);
    const filters = annualFilters(event.queryStringParameters, manifest);
    if (!filters.month) throw httpError("Por ahora las descargas se realizan por mes. Selecciona un mes.", 400);
    if (![2, 3].includes(manifest.schemaVersion)) throw httpError("Los archivos mensuales aún no están preparados para este corte.", 503);
    if (access.role === "coach") throw httpError("El resumen integral no corresponde al rol Coach.", 403);
    const selected = annualStores(access, manifest, filters);
    if (!selected.length) throw httpError("No hay tiendas en el alcance seleccionado.", 404);
    const matches = manifest.summaries.filter(item => item.year === filters.year && selected.includes(item.storeId)
      && item.path === `${filters.year}/summary/${item.storeId}.json.gz`);
    if (!matches.length) throw httpError("No hay información para ese año.", 404);
    const storeRows = await Promise.all(matches.map(async item => {
      const path = [2, 3].includes(manifest.schemaVersion) ? annualMonthlySummaryPath(release.version, item.year, item.storeId, manifest.schemaVersion)
        : annualSummaryPath(release.version, item.year, item.storeId);
      const blob = localDirectory ? await readFile(join(localDirectory, item.path))
        : await systemsStorage().download(path).then(result => {
          if (result.error || !result.data) throw httpError("No se pudo leer el resumen anual.", 503);
          return result.data.arrayBuffer().then(buffer => Buffer.from(buffer));
        });
      const rows = gunzipSync(blob).toString("utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
      return { storeId: item.storeId, rows };
    }));
    const result = summarizeAnnualReports(storeRows, filters, manifest.stores, manifest.cutoffs);
    const workbook = await buildAnnualSummaryWorkbook(result, filters, manifest.stores);
    return excelResponse(workbook, `resumen-comercial-${filters.year}.xlsx`);
  }

  async function commercialAssistantChat(event, sessionUser) {
    const access = await currentCommercialAccess(sessionUser);
    if (!["gerente_comercial", "jefe_comercial", "jefe_zonal", "coach"].includes(access.role)) {
      throw httpError("El consejo IA no corresponde a tu rol.", 403);
    }
    const key = process.env.GROQ_API_KEY;
    if (!key) throw httpError("El asistente comercial aún no está configurado.", 503);
    const input = bodyOf(event);
    const messages = (Array.isArray(input.messages) ? input.messages : []).slice(-12)
      .filter(row => ["user", "assistant"].includes(row?.role)
        && typeof row.content === "string" && row.content.trim() && row.content.length <= 4000)
      .map(row => ({ role: row.role, content: row.content }));
    if (!messages.length) throw httpError("Escribe una consulta para el asistente.", 400);
    const prompt = commercialAssistantMessages(access, input.context, messages);
    if (!prompt) return { answer: "No hay un hallazgo comprobable en la vista actual para este caso.", model: null };
    const models = [...new Set([
      process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b",
      ...(process.env.GROQ_FALLBACK_MODELS || "openai/gpt-oss-20b,qwen/qwen3.8-27b").split(",").map(value => value.trim()).filter(Boolean),
    ])];
    for (const model of models) {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", signal: AbortSignal.timeout(25000),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature: 0.15, max_tokens: 900, messages: prompt }),
      });
      if (response.ok) {
        const result = await response.json();
        const answer = result.choices?.[0]?.message?.content?.trim();
        if (answer) return { answer, model };
      } else if (![404, 408, 429].includes(response.status) && response.status < 500) {
        break;
      }
    }
    throw httpError("La IA no está disponible en este momento.", 503);
  }

  async function commercialAssistantTranscribe(event, sessionUser) {
    const access = await currentCommercialAccess(sessionUser);
    if (!["gerente_comercial", "jefe_comercial", "jefe_zonal", "coach"].includes(access.role)) {
      throw httpError("La transcripción IA no corresponde a tu rol.", 403);
    }
    const key = process.env.GROQ_API_KEY;
    if (!key) throw httpError("La transcripción comercial aún no está configurada.", 503);
    const input = bodyOf(event);
    const data = typeof input.audioBase64 === "string" ? Buffer.from(input.audioBase64, "base64") : Buffer.alloc(0);
    if (!data.length || data.length > 3 * 1024 * 1024) throw httpError("El audio debe pesar menos de 3 MiB.", 413);
    const fileName = String(input.fileName || "consulta.webm").replace(/[^a-zA-Z0-9._-]/g, "_");
    const form = new FormData();
    form.append("file", new Blob([data], { type: String(input.mimeType || "audio/webm") }), fileName);
    form.append("model", process.env.GROQ_TRANSCRIBE_MODEL || "whisper-large-v3-turbo");
    form.append("language", "es");
    form.append("response_format", "json");
    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST", signal: AbortSignal.timeout(25000),
      headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    if (!response.ok) throw httpError("No se pudo transcribir el audio en este momento.", response.status === 429 ? 429 : 502);
    const payload = await response.json();
    return { text: payload.text || "" };
  }

  return { systemUploadStart, systemUploadComplete, systemUploadCancel, systemUploadsList, commercialBatchStart, commercialBatchComplete, commercialBatchCancel, commercialBatchesList, normalizedReportCatalog, normalizedReportLink, annualReportCatalog, annualReportDimensions, annualDetailLinks, annualLocalDetailFile, annualSummaryExcel, commercialAssistantChat, commercialAssistantTranscribe };
}
