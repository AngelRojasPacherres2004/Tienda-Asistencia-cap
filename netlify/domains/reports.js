import { attendancePersonName } from "../../shared/attendance.js";
export function createReportsDomain({ supabase, httpError, hasStoreScope, applyStoreScope, cleanText, businessDate, isISODate, todayISO, resolveStoreScope, dbError, storeStaffRoles, fetchAllReportPages, normalizedPersonnelFields, humanize, normalizeLaborArea, normalizeDepartureReason, incidentCode, excelSheetName, createExcelWorkbook, styleHeader, excelResponse }) {
  const reportKinds = new Set([
    "personal", "asistencias", "documentos", "incidencias", "reclamaciones", "acciones",
    "requerimientos", "supervisiones", "capacitaciones", "tareas",
    "amonestaciones", "errores-personal",
  ]);

  const reportKindsByRole = {
    jefe_tienda: new Set(["personal", "asistencias", "amonestaciones", "errores-personal", "capacitaciones", "documentos", "reclamaciones", "acciones", "requerimientos", "supervisiones"]),
    jefe_zonal: new Set(["personal", "asistencias", "amonestaciones", "errores-personal", "incidencias", "supervisiones", "capacitaciones", "tareas"]),
  };

  const reportExcelColumns = {
    personal: [["Tienda", "tienda", 26], ["Nombres y apellidos", "nombre", 32], ["DNI", "dni", 13], ["Sexo", "sexo", 13], ["Cargo", "rol", 24], ["Área", "area", 22], ["Nivel de estudios", "nivel_estudios", 22], ["Ciclo / semestre", "ciclo_semestre", 23], ["Carrera", "carrera", 28], ["Edad", "edad", 10], ["Fecha de nacimiento", "fecha_nacimiento", 20], ["Mes de cumpleaños", "mes_cumpleanos", 19], ["Fecha de ingreso", "fecha_ingreso", 18], ["Estado civil", "estado_civil", 17], ["N.º de hijos", "numero_hijos", 14], ["Teléfono", "telefono", 16], ["Dirección", "direccion", 38], ["Distrito", "distrito", 23], ["Nacionalidad", "nacionalidad", 20], ["Jornada", "jornada", 16], ["Estado", "estado", 15]],
    asistencias: [["Fecha", "fecha", 15], ["Tienda", "tienda", 27], ["Trabajador", "trabajador", 32], ["DNI", "dni", 14], ["Estado", "estado", 20], ["Observación", "observaciones", 46]],
    amonestaciones: [["Fecha", "fecha", 14], ["Tienda", "tienda", 24], ["Trabajador", "trabajador", 30], ["DNI", "dni", 13], ["Cargo", "rol", 22], ["Tipo", "tipo", 22], ["Motivo", "motivo", 55]],
    "errores-personal": [["Fecha", "fecha", 14], ["Tienda", "tienda", 24], ["Trabajador", "trabajador", 30], ["DNI", "dni", 13], ["Cargo", "rol", 22], ["Categoría", "categoria", 22], ["Descripción", "descripcion", 55], ["Acción correctiva", "accion_correctiva", 48]],
    documentos: [["Tienda", "tienda", 24], ["Documento", "tipo_documento", 32], ["Código", "codigo", 16], ["Responsables", "responsables", 34], ["Frecuencia", "frecuencia_revision", 16], ["Emisión", "fecha_emision", 14], ["Vencimiento", "fecha_vencimiento", 16], ["Estado", "estado", 18]],
    incidencias: [["Código", "codigo", 15], ["Fecha", "fecha", 14], ["Tienda", "tienda", 30], ["Tipo", "tipo", 28], ["Alcance", "alcance", 22], ["Estado", "estado", 18], ["Descripción", "descripcion", 55], ["Responsable", "responsable", 28]],
    reclamaciones: [["Código", "codigo", 16], ["Fecha", "fecha", 14], ["Tienda", "tienda", 24], ["Consumidor", "consumidor", 28], ["Producto o servicio", "producto_servicio", 30], ["Monto", "monto", 14], ["Tipo", "tipo", 14], ["Estado", "estado", 18], ["Responsable", "responsable", 25], ["Detalle", "detalle", 55]],
    acciones: [["Fecha", "fecha", 14], ["Tienda", "tienda", 24], ["Acción", "accion", 36], ["Tipo", "tipo", 18], ["Responsable", "responsable", 26], ["Estado", "estado", 18], ["Objetivo", "objetivo", 42], ["Observación", "observacion", 42]],
    requerimientos: [["Código", "codigo", 15], ["Tienda", "tienda", 24], ["Requerimiento", "requerimiento", 45], ["Cantidad", "cantidad", 12], ["Áreas responsables", "areas", 34], ["Urgencia", "urgencia", 18], ["Inicio", "fecha_inicio", 14], ["Fecha objetivo", "fecha_objetivo", 16], ["Estado", "estado", 18], ["Comentario", "comentario", 40]],
    supervisiones: [["Código", "codigo", 15], ["Fecha", "fecha", 14], ["Tienda", "tienda", 24], ["Administrador", "administrador", 28], ["Periodo", "periodo", 18], ["Puntaje", "puntaje", 12], ["Observaciones", "observaciones", 16], ["Por validar", "por_validar", 14], ["Estado", "estado", 18]],
    capacitaciones: [["Tienda", "tienda", 24], ["Trabajador", "trabajador", 30], ["Curso", "curso", 32], ["Competencia", "competencia", 24], ["Avance", "avance", 14], ["Duración (h)", "duracion", 14], ["Nota", "nota", 12], ["Estado", "estado", 18], ["Finalización", "fecha_finalizacion", 16]],
    tareas: [["Tienda", "tienda", 24], ["Tarea", "titulo", 36], ["Responsable", "responsable", 26], ["Inicio", "fecha_inicio", 14], ["Fecha límite", "fecha_limite", 16], ["Prioridad", "prioridad", 14], ["Estado", "estado", 18], ["Descripción", "descripcion", 48]],
  };

  function reportScopeContains(scope, storeId) {
    if (!hasStoreScope(scope)) return true;
    if (!storeId) return false;
    return Array.isArray(scope) ? scope.map(Number).includes(Number(storeId)) : Number(scope) === Number(storeId);
  }

  function reportText(value) {
    if (Array.isArray(value)) return value.join(" · ");
    return value == null ? "" : String(value);
  }

  function applyReportFilters(rows, query) {
    const search = cleanText(query.q).toLocaleLowerCase("es");
    return rows.filter((row) => {
      const rawDate = String(row._fecha || "");
      const date = rawDate.length > 10 ? businessDate(rawDate) : rawDate;
      if (query.desde && isISODate(query.desde) && date && date < query.desde) return false;
      if (query.hasta && isISODate(query.hasta) && date && date > query.hasta) return false;
      if (query.estado && row._estado !== query.estado) return false;
      if (query.prioridad && !row._prioridades?.includes(query.prioridad)) return false;
      if (search && !Object.values(row).some((value) => reportText(value).toLocaleLowerCase("es").includes(search))) return false;
      return true;
    }).map(({ _fecha, _estado, _prioridades, ...row }) => row);
  }

  function reportAge(date, cutoff = todayISO()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return "";
    const birth = new Date(`${date}T12:00:00Z`);
    const asOf = new Date(`${cutoff}T12:00:00Z`);
    if (birth > asOf) return "";
    let years = asOf.getUTCFullYear() - birth.getUTCFullYear();
    if (asOf.getUTCMonth() < birth.getUTCMonth() || (asOf.getUTCMonth() === birth.getUTCMonth() && asOf.getUTCDate() < birth.getUTCDate())) years--;
    return years;
  }

  async function getReportRows(event, user, kind) {
    if (!reportKinds.has(kind)) throw httpError("El reporte solicitado no existe.", 404);
    if (reportKindsByRole[user.rol] && !reportKindsByRole[user.rol].has(kind)) throw httpError("Este reporte no corresponde a tu rol.", 403);
    const query = event.queryStringParameters || {};
    const scope = await resolveStoreScope(user, query.tienda_id);
    let rows = [];

    if (kind === "personal") {
      let request = supabase.from("usuarios").select("id,tienda_id,nombres,apellidos,dni,usuario,telefono,sexo,area_laboral,grado_academico,ciclo_semestre,carrera,fecha_nacimiento,mes_cumpleanos,estado_civil,numero_hijos,direccion,distrito,nacionalidad,regimen_jornada,rol,estado,fecha_ingreso,fecha_salida,motivo_salida,tiendas!usuarios_tienda_id_fkey(nombre)").in("rol", storeStaffRoles).order("nombres");
      request = applyStoreScope(request, scope);
      const data = await fetchAllReportPages(request.order("id"));
      rows = (data || []).map((row) => { const normalized = normalizedPersonnelFields(row); return { id:row.id, nombre:`${row.nombres || ""} ${row.apellidos || ""}`.trim(), tienda:row.tiendas?.nombre || "Sin asignar", rol:row.rol === "jefe_tienda" ? "Administrador de tienda" : humanize(row.rol), dni:row.dni || "", sexo:humanize(row.sexo), area:normalizeLaborArea(row.area_laboral) || "", nivel_estudios:humanize(row.grado_academico), ciclo_semestre:row.ciclo_semestre || "", carrera:normalized.carrera || "", edad:reportAge(row.fecha_nacimiento, isISODate(query.hasta) ? query.hasta : todayISO()), fecha_nacimiento:row.fecha_nacimiento || "", mes_cumpleanos:row.mes_cumpleanos || row.fecha_nacimiento?.slice(5,7) || "", estado_civil:humanize(row.estado_civil), numero_hijos:row.numero_hijos ?? "", telefono:row.telefono || "", direccion:row.direccion || "", distrito:normalized.distrito || "", nacionalidad:normalized.nacionalidad || "", jornada:row.regimen_jornada ? `${row.regimen_jornada.replace("h", " horas")}` : "", fecha_ingreso:row.fecha_ingreso || "", fecha_salida:row.fecha_salida || "", motivo_salida:normalizeDepartureReason(row.motivo_salida) || "", estado:row.estado, _fecha:row.fecha_ingreso, _estado:row.estado }; })
        .sort((a, b) => (a.estado === "activo" ? 0 : 1) - (b.estado === "activo" ? 0 : 1) || a.nombre.localeCompare(b.nombre, "es"));
    }
    if (kind === "asistencias") {
      let request = supabase.from("asistencias").select("id,tienda_id,fecha,estado,observaciones,tiendas(nombre),usuarios!asistencias_usuario_id_fkey(nombres,apellidos,dni),cobertura_trabajador:cobertura_trabajadores(nombre_manual,dni_manual)").order("fecha", { ascending:false });
      request = applyStoreScope(request, scope);
      const data = await fetchAllReportPages(request.order("id"));
      rows = (data || []).map((row) => ({ id:row.id, fecha:row.fecha, tienda:row.tiendas?.nombre || "", trabajador:attendancePersonName(row), dni:row.usuarios?.dni || row.cobertura_trabajador?.dni_manual || "", estado:row.estado, observaciones:row.observaciones || "", _fecha:row.fecha, _estado:row.estado }));
    }
    if (kind === "amonestaciones") {
      let request = supabase.from("amonestaciones").select("id,tienda_id,fecha,tipo,motivo,tiendas(nombre),usuarios!amonestaciones_usuario_id_fkey(nombres,apellidos,dni,rol)").order("fecha", { ascending:false });
      request = applyStoreScope(request, scope);
      const data = await fetchAllReportPages(request.order("id"));
      rows = (data || []).map((row) => ({ id:row.id, fecha:row.fecha, tienda:row.tiendas?.nombre || "", trabajador:`${row.usuarios?.nombres || ""} ${row.usuarios?.apellidos || ""}`.trim(), dni:row.usuarios?.dni || "", rol:row.usuarios?.rol === "jefe_tienda" ? "Administrador de tienda" : humanize(row.usuarios?.rol || ""), tipo:humanize(row.tipo), motivo:row.motivo, _fecha:row.fecha }));
    }
    if (kind === "errores-personal") {
      let request = supabase.from("errores_personal").select("id,tienda_id,fecha,categoria,descripcion,accion_correctiva,tiendas(nombre),usuarios!errores_personal_usuario_id_fkey(nombres,apellidos,dni,rol)").order("fecha", { ascending:false });
      request = applyStoreScope(request, scope);
      const data = await fetchAllReportPages(request.order("id"));
      rows = (data || []).map((row) => ({ id:row.id, fecha:row.fecha, tienda:row.tiendas?.nombre || "", trabajador:`${row.usuarios?.nombres || ""} ${row.usuarios?.apellidos || ""}`.trim(), dni:row.usuarios?.dni || "", rol:row.usuarios?.rol === "jefe_tienda" ? "Administrador de tienda" : humanize(row.usuarios?.rol || ""), categoria:row.categoria, descripcion:row.descripcion, accion_correctiva:row.accion_correctiva || "", _fecha:row.fecha }));
    }
    if (kind === "documentos") {
      let request = supabase.from("documentos_municipales").select("id,tienda_id,tipo_documento,codigo,responsables,area_responsable,frecuencia_revision,fecha_emision,fecha_vencimiento,estado,tiendas(nombre)").order("fecha_vencimiento");
      request = applyStoreScope(request, scope);
      const data = await fetchAllReportPages(request.order("id"));
      rows = (data || []).map((row) => ({ id:row.id, tienda:row.tiendas?.nombre || "", tipo_documento:row.tipo_documento, codigo:row.codigo || "", responsables:(row.responsables?.length ? row.responsables : [row.area_responsable]).filter(Boolean).join(" · "), frecuencia_revision:row.frecuencia_revision || "", fecha_emision:row.fecha_emision || "", fecha_vencimiento:row.fecha_vencimiento || "", estado:row.estado, _fecha:row.fecha_vencimiento || row.fecha_emision, _estado:row.estado }));
    }
    if (kind === "reclamaciones") {
      let request = supabase.from("reclamaciones_tienda").select("id,tienda_id,codigo_hoja,fecha,consumidor_nombre,producto_servicio,monto,tipo,detalle,responsable,estado,tiendas(nombre)").order("fecha", { ascending:false });
      request = applyStoreScope(request, scope);
      const data = await fetchAllReportPages(request.order("id"));
      rows = (data || []).map((row) => ({ id:row.id, codigo:row.codigo_hoja, fecha:row.fecha, tienda:row.tiendas?.nombre || "", consumidor:row.consumidor_nombre, producto_servicio:row.producto_servicio, monto:row.monto ?? "", tipo:humanize(row.tipo), estado:row.estado, responsable:row.responsable || "", detalle:row.detalle, _fecha:row.fecha, _estado:row.estado }));
    }
    if (kind === "acciones") {
      let request = supabase.from("acciones_tienda").select("id,tienda_id,fecha,tipo,responsable,accion,estado,objetivo,observacion,tiendas(nombre)").order("fecha", { ascending:false });
      request = applyStoreScope(request, scope);
      const data = await fetchAllReportPages(request.order("id"));
      rows = (data || []).map((row) => ({ id:row.id, fecha:row.fecha, tienda:row.tiendas?.nombre || "", accion:row.accion, tipo:humanize(row.tipo), responsable:row.responsable, estado:row.estado, objetivo:row.objetivo || "", observacion:row.observacion || "", _fecha:row.fecha, _estado:row.estado }));
    }
    if (kind === "requerimientos") {
      let request = supabase.from("requerimientos_tienda").select("id,tienda_id,requerimiento,cantidad,areas_responsables,urgencia,fecha_inicio,fecha_fin_objetivo,estado,comentario,tiendas(nombre)").order("fecha_inicio", { ascending:false });
      request = applyStoreScope(request, scope);
      const data = await fetchAllReportPages(request.order("id"));
      rows = (data || []).map((row) => ({ id:row.id, codigo:`REQ-${String(row.id).padStart(4,"0")}`, tienda:row.tiendas?.nombre || "", requerimiento:row.requerimiento, cantidad:row.cantidad ?? "", areas:(row.areas_responsables || []).join(" · "), urgencia:humanize(row.urgencia), fecha_inicio:row.fecha_inicio, fecha_objetivo:row.fecha_fin_objetivo || "", estado:row.estado, comentario:row.comentario || "", _fecha:row.fecha_inicio, _estado:row.estado }));
    }
    if (kind === "capacitaciones") {
      let request = supabase.from("capacitacion_progreso").select("id,tienda_id,estado,duracion_horas,nota,fecha_finalizacion,updated_at,tiendas(nombre),cursos(nombre,competencia),usuarios!capacitacion_progreso_usuario_id_fkey(nombres,apellidos)").order("updated_at", { ascending:false });
      request = applyStoreScope(request, scope);
      const data = await fetchAllReportPages(request.order("id"));
      rows = (data || []).map((row) => ({ id:row.id, tienda:row.tiendas?.nombre || "", trabajador:`${row.usuarios?.nombres || ""} ${row.usuarios?.apellidos || ""}`.trim(), curso:row.cursos?.nombre || "", competencia:row.cursos?.competencia || "", avance:row.estado === "completado" ? "100%" : row.estado === "en_curso" ? "En progreso" : "0%", duracion:row.duracion_horas ?? "", nota:row.nota ?? "", estado:row.estado, fecha_finalizacion:row.fecha_finalizacion || "", _fecha:row.fecha_finalizacion || row.updated_at, _estado:row.estado }));
    }
    if (kind === "tareas") {
      let request = supabase.from("tareas_zonales").select("id,tienda_id,titulo,descripcion,responsable,fecha_inicio,fecha_limite,prioridad,estado,tiendas(nombre)").order("fecha_limite");
      request = applyStoreScope(request, scope);
      const data = await fetchAllReportPages(request.order("id"));
      rows = (data || []).map((row) => ({ id:row.id, tienda:row.tiendas?.nombre || "", titulo:row.titulo, responsable:row.responsable, fecha_inicio:row.fecha_inicio, fecha_limite:row.fecha_limite, prioridad:row.prioridad, estado:row.estado, descripcion:row.descripcion || "", _fecha:row.fecha_limite || row.fecha_inicio, _estado:row.estado }));
    }
    if (kind === "supervisiones") {
      let visitsRequest = supabase.from("visitas_zonales").select("id,tienda_id,fecha,periodo,puntaje,tiendas(nombre,jefe:usuarios!tiendas_jefe_fk(nombres,apellidos))").order("fecha", { ascending:false });
      let observationsRequest = supabase.from("observaciones_zonales").select("id,visita_id,tienda_id,estado,prioridad");
      visitsRequest = applyStoreScope(visitsRequest, scope); observationsRequest = applyStoreScope(observationsRequest, scope);
      const [visits, observations] = await Promise.all([fetchAllReportPages(visitsRequest), fetchAllReportPages(observationsRequest)]);
      rows = (visits || []).map((row) => { const items=(observations || []).filter((item) => Number(item.visita_id) === Number(row.id)); const pending=items.filter((item) => item.estado === "en_validacion").length; const state=pending ? "por_validar" : items.some((item) => item.estado !== "levantada") ? "en_seguimiento" : "cerrada"; const chief=row.tiendas?.jefe; return { id:row.id, codigo:`SUP-${String(row.id).padStart(4,"0")}`, fecha:row.fecha, tienda:row.tiendas?.nombre || "", administrador:chief ? `${chief.nombres} ${chief.apellidos}` : "Sin asignar", periodo:row.periodo || "", puntaje:row.puntaje ?? "", observaciones:items.length, por_validar:pending, estado:state, _fecha:row.fecha, _estado:state, _prioridades:items.map((item) => item.prioridad).filter(Boolean) }; });
    }
    if (kind === "incidencias") {
      let localRequest = supabase.from("incidencias").select("id,tienda_id,fecha,tipo,area,gravedad,estado,descripcion,tiendas(nombre),usuarios!incidencias_registrado_por_fkey(nombres,apellidos)").order("fecha", { ascending:false });
      localRequest = applyStoreScope(localRequest, scope);
      let zonalRequest = supabase.from("incidencias_zonales").select("id,jefe_zonal_id,tipo,alcance,tienda_origen_id,tienda_afectada_id,fecha,descripcion,estado,responsable_seguimiento,origen:tiendas!incidencias_zonales_tienda_origen_id_fkey(nombre),afectada:tiendas!incidencias_zonales_tienda_afectada_id_fkey(nombre)").order("fecha", { ascending:false });
      if (user.rol === "jefe_zonal") zonalRequest = zonalRequest.eq("jefe_zonal_id", user.id);
      const [local, zonal] = await Promise.all([fetchAllReportPages(localRequest), fetchAllReportPages(zonalRequest)]);
      const localRows=(local || []).map((row) => ({ id:`local-${row.id}`, codigo:incidentCode(row), fecha:businessDate(row.fecha), tienda:row.tiendas?.nombre || "", tipo:humanize(row.tipo), alcance:"Una tienda", estado:row.estado, descripcion:row.descripcion, responsable:row.usuarios ? `${row.usuarios.nombres} ${row.usuarios.apellidos}` : "", _fecha:row.fecha, _estado:row.estado }));
      const zonalRows=(zonal || []).filter((row) => reportScopeContains(scope,row.tienda_origen_id) || reportScopeContains(scope,row.tienda_afectada_id)).map((row) => ({ id:`zonal-${row.id}`, codigo:`IZ-${String(row.id).padStart(4,"0")}`, fecha:row.fecha, tienda:[row.origen?.nombre,row.afectada?.nombre].filter(Boolean).join(" → "), tipo:row.tipo === "diferencia_transferencia" ? "Mercadería liberada / diferencia en transferencia" : humanize(row.tipo), alcance:humanize(row.alcance), estado:row.estado, descripcion:row.descripcion, responsable:row.responsable_seguimiento || "", _fecha:row.fecha, _estado:row.estado }));
      rows=[...localRows,...zonalRows].sort((a,b) => String(b._fecha).localeCompare(String(a._fecha)));
    }
    return applyReportFilters(rows, query);
  }

  function addReportSheet(workbook, kind, rows) {
    const sheet=workbook.addWorksheet(excelSheetName(reportExcelColumns[kind]?.[0]?.[0] ? humanize(kind) : "Reporte"));
    sheet.columns=reportExcelColumns[kind].map(([header,key,width]) => ({ header,key,width }));
    const humanKeys=new Set(["estado","rol","tipo","alcance","urgencia","prioridad"]);
    sheet.addRows(rows.map((row) => Object.fromEntries(reportExcelColumns[kind].map(([,key]) => [key, humanKeys.has(key) ? humanize(row[key]) : row[key] ?? ""]))));
    styleHeader(sheet); return sheet;
  }

  function addPersonnelSummary(workbook, rows) {
    const summary = new Map();
    for (const person of rows) {
      const key = person.tienda || "Sin asignar";
      if (!summary.has(key)) summary.set(key, { tienda:key, jornada_8h_mujeres:0, jornada_8h_hombres:0, otras_mujeres:0, otros_hombres:0, sin_especificar:0, total:0 });
      const entry = summary.get(key);
      const gender = String(person.sexo || "").toLowerCase();
      const isEight = String(person.jornada || "").toLowerCase() === "8h";
      if (gender === "mujer") entry[isEight ? "jornada_8h_mujeres" : "otras_mujeres"]++;
      else if (gender === "hombre") entry[isEight ? "jornada_8h_hombres" : "otros_hombres"]++;
      else entry.sin_especificar++;
      entry.total++;
    }
    const sheet = workbook.addWorksheet("Resumen por tienda");
    sheet.columns = [["Tienda","tienda",27],["8 h · mujeres","jornada_8h_mujeres",18],["8 h · hombres","jornada_8h_hombres",18],["Otras jornadas · mujeres","otras_mujeres",24],["Otras jornadas · hombres","otros_hombres",24],["Sexo sin especificar","sin_especificar",22],["Total personas","total",18]].map(([header,key,width])=>({header,key,width}));
    sheet.addRows([...summary.values()].sort((a,b)=>a.tienda.localeCompare(b.tienda,"es")));
    const totals = { tienda:"TOTAL" };
    for (const key of ["jornada_8h_mujeres","jornada_8h_hombres","otras_mujeres","otros_hombres","sin_especificar","total"]) totals[key] = [...summary.values()].reduce((sum,row)=>sum+row[key],0);
    sheet.addRow(totals);
    styleHeader(sheet);
    sheet.autoFilter = { from:"A1", to:"G1" };
    sheet.views = [{ state:"frozen", ySplit:1 }];
  }

  function addPersonnelDepartures(workbook, rows) {
    const sheet=workbook.addWorksheet("Salidas");
    sheet.columns=[["Tienda","tienda",26],["Nombres y apellidos","nombre",32],["DNI","dni",14],["Sexo","sexo",15],["Cargo","rol",25],["Área","area",23],["Fecha de ingreso","fecha_ingreso",18],["Fecha de salida","fecha_salida",18],["Motivo de salida","motivo_salida",42]].map(([header,key,width])=>({header,key,width}));
    sheet.addRows(rows.filter(row=>row.fecha_salida).sort((a,b)=>String(b.fecha_salida).localeCompare(String(a.fecha_salida))));
    styleHeader(sheet);
    sheet.autoFilter={from:"A1",to:"I1"};
    sheet.views=[{state:"frozen",ySplit:1}];
  }

  function addAttendanceSummary(workbook, rows) {
    const summary = new Map();
    const states = ["presente","tardanza","medio_turno","apoyo","apoyo_ingreso","descanso","falta","permiso","descanso_medico","suspension"];
    for (const person of rows) {
      const key = `${person.fecha}|${person.tienda}`;
      if (!summary.has(key)) summary.set(key,{ fecha:person.fecha, tienda:person.tienda, total:0, ...Object.fromEntries(states.map(state=>[state,0])) });
      const entry = summary.get(key);
      entry.total++;
      if (states.includes(person.estado)) entry[person.estado]++;
    }
    const sheet = workbook.addWorksheet("Resumen de asistencia");
    sheet.columns = [["Fecha","fecha",15],["Tienda","tienda",27],["Marcas registradas","total",20],["Asistencia","presente",16],["Tardanza","tardanza",16],["Medio turno","medio_turno",17],["Apoyo (salida)","apoyo",20],["Apoyo (ingreso)","apoyo_ingreso",20],["Descanso","descanso",16],["Falta","falta",15],["Permiso","permiso",15],["Descanso médico","descanso_medico",20],["Suspensión","suspension",16]].map(([header,key,width])=>({header,key,width}));
    sheet.addRows([...summary.values()].sort((a,b)=>b.fecha.localeCompare(a.fecha)||a.tienda.localeCompare(b.tienda,"es")));
    styleHeader(sheet);
    sheet.autoFilter = { from:"A1", to:"M1" };
    sheet.views = [{ state:"frozen", ySplit:1 }];
    sheet.addRow([]);
    sheet.addRow(["Una persona sin marca no se clasifica automáticamente como falta."]);
  }

  async function exportReportExcel(event, user, kind) {
    const rows=await getReportRows(event,user,kind); const workbook=await createExcelWorkbook(); workbook.creator="Asiste"; workbook.created=new Date();
    if (kind === "personal") { addPersonnelSummary(workbook,rows.filter(person=>person.estado==="activo")); addPersonnelDepartures(workbook,rows); }
    if (kind === "asistencias") addAttendanceSummary(workbook,rows);
    const detail=addReportSheet(workbook,kind,rows);
    if (kind === "personal" || kind === "asistencias") { detail.name=kind === "personal" ? "Detalle personal" : "Detalle asistencia"; detail.autoFilter={from:"A1",to:`${detail.getColumn(detail.columnCount).letter}1`}; detail.views=[{state:"frozen",ySplit:1}]; }
    return excelResponse(workbook,`reporte-${kind}-${todayISO()}.xlsx`);
  }

  async function getMovements(event,user) {
    const query=event.queryStringParameters || {}; const scope=await resolveStoreScope(user,query.tienda_id); const movements=[];
    let attendanceRequest=supabase.from("log_asistencias").select("id,tienda_id,operacion,estado_anterior,estado_nuevo,created_at,tiendas(nombre),usuarios!log_asistencias_usuario_id_fkey(nombres,apellidos),realizador:usuarios!log_asistencias_realizado_por_fkey(nombres,apellidos)").order("created_at",{ascending:false});
    attendanceRequest=applyStoreScope(attendanceRequest,scope);
    let observationsRequest=supabase.from("observaciones_zonales").select("id,tienda_id,estado,descripcion,comentario_validacion,fecha_validacion,updated_at,tiendas(nombre),validador:usuarios!observaciones_zonales_validado_por_fkey(nombres,apellidos)").not("fecha_validacion","is",null).order("fecha_validacion",{ascending:false});
    observationsRequest=applyStoreScope(observationsRequest,scope);
    let zonalIncidentsRequest=supabase.from("incidencias_zonales").select("id,jefe_zonal_id,tienda_origen_id,tienda_afectada_id,tipo,estado,descripcion,responsable_seguimiento,created_at,updated_at,origen:tiendas!incidencias_zonales_tienda_origen_id_fkey(nombre),afectada:tiendas!incidencias_zonales_tienda_afectada_id_fkey(nombre)").order("updated_at",{ascending:false});
    if(user.rol==="jefe_zonal")zonalIncidentsRequest=zonalIncidentsRequest.eq("jefe_zonal_id",user.id);
    let requirementsRequest=supabase.from("requerimientos_tienda").select("id,tienda_id,requerimiento,tiendas(nombre)"); requirementsRequest=applyStoreScope(requirementsRequest,scope);
    const [{data:attendance,error:attendanceError},{data:observations,error:observationsError},{data:zonalIncidents,error:zonalError},{data:requirements,error:requirementsError}]=await Promise.all([attendanceRequest,observationsRequest,user.rol === 'jefe_tienda' ? Promise.resolve({data:[]}) : zonalIncidentsRequest,requirementsRequest]);
    if(attendanceError||observationsError||zonalError||requirementsError)throw dbError(attendanceError||observationsError||zonalError||requirementsError);
    movements.push(...(attendance||[]).map((row)=>({id:row.id,modulo:"asistencia",operacion:row.operacion,titulo:`Asistencia · ${row.usuarios ? `${row.usuarios.nombres} ${row.usuarios.apellidos}` : "Trabajador"}`,detalle:"Cambio en el estado de asistencia.",tienda:row.tiendas?.nombre||"",realizado_por:row.realizador?`${row.realizador.nombres} ${row.realizador.apellidos}`:"",fecha_hora:row.created_at,valor_anterior:row.estado_anterior?humanize(row.estado_anterior):"",valor_nuevo:row.estado_nuevo?humanize(row.estado_nuevo):""})));
    const requirementIds=(requirements||[]).map((row)=>row.id); const requirementById=new Map((requirements||[]).map((row)=>[row.id,row]));
    if(requirementIds.length){const {data:tracking,error}=await supabase.from("requerimiento_seguimientos").select("id,requerimiento_id,comentario,estado,created_at,usuarios(nombres,apellidos)").in("requerimiento_id",requirementIds).order("created_at",{ascending:false});if(error)throw dbError(error);movements.push(...(tracking||[]).map((row)=>{const requirement=requirementById.get(row.requerimiento_id);return{id:row.id,modulo:"requerimientos",operacion:"seguimiento",titulo:`Seguimiento · REQ-${String(row.requerimiento_id).padStart(4,"0")}`,detalle:row.comentario||requirement?.requerimiento||"",tienda:requirement?.tiendas?.nombre||"",realizado_por:row.usuarios?`${row.usuarios.nombres} ${row.usuarios.apellidos}`:"",fecha_hora:row.created_at,valor_anterior:"",valor_nuevo:humanize(row.estado)};}));}
    movements.push(...(observations||[]).map((row)=>({id:row.id,modulo:"supervisiones",operacion:"validacion",titulo:`Validación · OBS-${String(row.id).padStart(4,"0")}`,detalle:row.comentario_validacion||row.descripcion,tienda:row.tiendas?.nombre||"",realizado_por:row.validador?`${row.validador.nombres} ${row.validador.apellidos}`:"Jefe zonal",fecha_hora:row.fecha_validacion||row.updated_at,valor_anterior:"En validación",valor_nuevo:humanize(row.estado)})));
    movements.push(...(zonalIncidents||[]).filter((row)=>reportScopeContains(scope,row.tienda_origen_id)||reportScopeContains(scope,row.tienda_afectada_id)).map((row)=>({id:row.id,modulo:"incidencias",operacion:row.updated_at!==row.created_at?"edicion":"creacion",titulo:`Incidencia · IZ-${String(row.id).padStart(4,"0")}`,detalle:row.descripcion,tienda:[row.origen?.nombre,row.afectada?.nombre].filter(Boolean).join(" → "),realizado_por:row.responsable_seguimiento||"Jefe zonal",fecha_hora:row.updated_at||row.created_at,valor_anterior:"",valor_nuevo:humanize(row.estado)})));
    const search=cleanText(query.q).toLocaleLowerCase("es");
    return movements.filter((row)=>(!query.modulo||row.modulo===query.modulo)&&(!query.operacion||row.operacion===query.operacion)&&(!query.desde||String(row.fecha_hora).slice(0,10)>=query.desde)&&(!query.hasta||String(row.fecha_hora).slice(0,10)<=query.hasta)&&(!search||Object.values(row).some((value)=>reportText(value).toLocaleLowerCase("es").includes(search)))).sort((a,b)=>String(b.fecha_hora).localeCompare(String(a.fecha_hora))).slice(0,500);
  }

  async function exportMovementsExcel(event,user){const rows=await getMovements(event,user);const workbook=await createExcelWorkbook();const sheet=workbook.addWorksheet("Historial");sheet.columns=[{header:"Fecha y hora",key:"fecha_hora",width:22},{header:"Módulo",key:"modulo",width:20},{header:"Operación",key:"operacion",width:18},{header:"Tienda",key:"tienda",width:26},{header:"Movimiento",key:"titulo",width:34},{header:"Detalle",key:"detalle",width:55},{header:"Realizado por",key:"realizado_por",width:28},{header:"Valor anterior",key:"valor_anterior",width:22},{header:"Valor nuevo",key:"valor_nuevo",width:22}];sheet.addRows(rows.map((row)=>({...row,modulo:humanize(row.modulo),operacion:humanize(row.operacion)})));styleHeader(sheet);return excelResponse(workbook,`historial-movimientos-${todayISO()}.xlsx`);}

  return { getReportRows, exportReportExcel, getMovements, exportMovementsExcel };
}
