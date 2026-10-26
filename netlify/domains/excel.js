export function createExcelDomain({
  createExcelWorkbook, dbError, estadoLabels, fetchAllReportPages,
  httpError, isISODate, progresoLabels, readAllResult, supabase,
}) {
  function excelSheetName(name) {
    return String(name || "Hoja").replace(/[\\/?*[\]:]/g, "").slice(0, 31) || "Hoja";
  }

  function styleHeader(worksheet) {
    const headerRow = worksheet.getRow(1);
    const columnCount = worksheet.columnCount || worksheet.columns.length;
    const headerNames = headerRow.values.slice(1).map((value) => String(value || "").toLowerCase());
    worksheet.properties.defaultRowHeight = 21;
    headerRow.height = 30;
    headerRow.font = { name: "Aptos Display", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D4F86" } };
    headerRow.eachCell((cell) => { cell.border = { top: { style: "thin", color: { argb: "FF083B65" } }, bottom: { style: "thin", color: { argb: "FF083B65" } }, left: { style: "thin", color: { argb: "FF083B65" } }, right: { style: "thin", color: { argb: "FF083B65" } } }; });
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.height = 22;
      row.eachCell((cell, columnNumber) => {
        cell.font = { name: "Aptos", size: 10, color: { argb: "FF1C3044" } };
        cell.alignment = { vertical: "middle", wrapText: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowNumber % 2 === 0 ? "FFF4F8FB" : "FFFFFFFF" } };
        cell.border = { bottom: { style: "hair", color: { argb: "FFC7D7E5" } }, right: { style: "hair", color: { argb: "FFD6E1EA" } } };
        const header = headerNames[columnNumber - 1] || "";
        if (header.includes("fecha")) { cell.numFmt = "dd/mm/yyyy"; cell.alignment = { vertical: "middle", horizontal: "center" }; }
        if (header.includes("dni") || header.includes("teléfono") || header.includes("telefono")) cell.alignment = { vertical: "middle", horizontal: "center" };
        if (header === "estado") {
          const value = String(cell.value || "").toLowerCase();
          const tone = value.includes("complet") || value.includes("activo") || value.includes("atendido") ? "FFE2F5E9" : value.includes("pend") || value.includes("progreso") ? "FFFFF1CE" : value.includes("venc") || value.includes("cancel") || value.includes("falta") ? "FFFBE1E3" : "FFE9F1F8";
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tone } }; cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FF1C3044" } };
        }
      });
    });
    worksheet.columns.forEach((column, index) => {
      const header = headerNames[index] || "";
      const longText = /observaci|descripci|comentario|detalle|resultado|curso|requerimiento/i.test(header);
      const timestamp = /created|updated|fecha.*(registro|creaci|actualiz)/i.test(header);
      let contentWidth = header.length;
      column.eachCell({ includeEmpty: false }, (cell) => { contentWidth = Math.max(contentWidth, String(cell.value ?? "").replaceAll("\n", " ").length); });
      column.width = Math.min(Math.max(contentWidth + 3, longText ? 28 : timestamp ? 26 : 14), longText ? 48 : 32);
    });
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnCount } };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.pageSetup = { orientation: columnCount > 7 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: .25, right: .25, top: .5, bottom: .5, header: .2, footer: .2 } };
  }

  async function fetchAsistenciasExport(tiendaId, desde, hasta) {
    let request = supabase.from("asistencias")
      .select("fecha,estado,observaciones,usuarios!asistencias_usuario_id_fkey(nombres,apellidos,dni)")
      .order("fecha", { ascending: false });
    if (tiendaId) request = request.eq("tienda_id", tiendaId);
    if (desde && isISODate(desde)) request = request.gte("fecha", desde);
    if (hasta && isISODate(hasta)) request = request.lte("fecha", hasta);
    const data = await fetchAllReportPages(request.order("id"));
    return data.map((row) => ({
      fecha: row.fecha, empleado: `${row.usuarios?.nombres || ""} ${row.usuarios?.apellidos || ""}`.trim(),
      dni: row.usuarios?.dni || "", estado: estadoLabels[row.estado] || row.estado,
      observaciones: row.observaciones || "",
    }));
  }

  async function fetchCapacitacionesExport(tiendaId, desde, hasta) {
    let request = supabase.from("capacitacion_progreso")
      .select("estado,duracion_horas,nota,fecha_finalizacion,updated_at,cursos(nombre,competencia),encargados(nombre),usuarios!capacitacion_progreso_usuario_id_fkey(nombres,apellidos,usuario)")
      .order("updated_at", { ascending: false });
    if (tiendaId) request = request.eq("tienda_id", tiendaId);
    if (desde && isISODate(desde)) request = request.gte("updated_at", `${desde}T00:00:00-05:00`);
    if (hasta && isISODate(hasta)) request = request.lte("updated_at", `${hasta}T23:59:59.999-05:00`);
    const data = await fetchAllReportPages(request.order("id"));
    return data.map((row) => ({
      curso: row.cursos?.nombre || "", competencia: row.cursos?.competencia || "",
      empleado: `${row.usuarios?.nombres || ""} ${row.usuarios?.apellidos || ""}`.trim(),
      usuario: row.usuarios?.usuario || "",
      estado: progresoLabels[row.estado] || row.estado,
      duracion_horas: row.duracion_horas || "", nota: row.nota ?? "",
      encargado: row.encargados?.nombre || "",
      fecha_finalizacion: row.fecha_finalizacion || "",
    }));
  }

  function addAsistenciasSheet(workbook, sheetName, rows) {
    const sheet = workbook.addWorksheet(excelSheetName(sheetName));
    sheet.columns = [
      { header: "Fecha", key: "fecha", width: 14 },
      { header: "Empleado", key: "empleado", width: 28 },
      { header: "DNI", key: "dni", width: 12 },
      { header: "Estado", key: "estado", width: 14 },
      { header: "Observaciones", key: "observaciones", width: 30 },
    ];
    sheet.addRows(rows);
    styleHeader(sheet);
  }

  function addCapacitacionesSheet(workbook, sheetName, rows) {
    const sheet = workbook.addWorksheet(excelSheetName(sheetName));
    sheet.columns = [
      { header: "Curso", key: "curso", width: 26 },
      { header: "Competencia", key: "competencia", width: 20 },
      { header: "Empleado", key: "empleado", width: 28 },
      { header: "Usuario", key: "usuario", width: 16 },
      { header: "Estado", key: "estado", width: 14 },
      { header: "Duración (h)", key: "duracion_horas", width: 14 },
      { header: "Nota (0-20)", key: "nota", width: 14 },
      { header: "Encargado", key: "encargado", width: 20 },
      { header: "Fecha finalización", key: "fecha_finalizacion", width: 16 },
    ];
    sheet.addRows(rows);
    styleHeader(sheet);
  }

  async function excelResponse(workbook, filename) {
    const buffer = await workbook.xlsx.writeBuffer();
    const safeFilename = String(filename).replace(/[^a-zA-Z0-9._-]/g, "-");
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
      body: Buffer.from(buffer).toString("base64"),
      isBase64Encoded: true,
    };
  }

  async function exportStoreUsersExcel(actor, templateOnly = false) {
    const workbook = await createExcelWorkbook();
    const sheet = workbook.addWorksheet("Usuarios");
    sheet.columns = [
      { header: "Nombres", key: "nombres", width: 22 },
      { header: "Apellidos", key: "apellidos", width: 22 },
      { header: "DNI", key: "dni", width: 12 },
      { header: "Usuario", key: "usuario", width: 18 },
      { header: "Contraseña", key: "password", width: 18 },
      { header: "Teléfono", key: "telefono", width: 14 },
      { header: "Fecha ingreso", key: "fecha_ingreso", width: 16 },
    ];
    sheet.getCell("E1").note = "Opcional para empleados. Si agregas una contraseña, debe tener como mínimo 3 caracteres.";
    for (let rowNumber = 2; rowNumber <= 501; rowNumber += 1) {
      sheet.getCell(`E${rowNumber}`).dataValidation = {
        type: "custom",
        formulae: [`OR(E${rowNumber}="",LEN(E${rowNumber})>=6)`],
        allowBlank: true,
        showInputMessage: true,
        promptTitle: "Contraseña opcional",
        prompt: "Déjala vacía o escribe una contraseña de mínimo 3 caracteres.",
        showErrorMessage: true,
        errorTitle: "Contraseña no válida",
        error: "La contraseña debe estar vacía o tener al menos 3 caracteres.",
      };
    }
    if (templateOnly) {
      const instructions = workbook.addWorksheet("Instrucciones");
      instructions.columns = [{ header: "Cómo completar la plantilla", key: "texto", width: 90 }];
      instructions.addRows([
        { texto: "Completa una persona por fila en la hoja Usuarios. No cambies los nombres de las columnas." },
        { texto: "DNI: exactamente 8 dígitos. Teléfono: 9 dígitos (opcional)." },
        { texto: "Usuario: mínimo 2 caracteres; usa letras, números, punto, guion o guion bajo." },
        { texto: "Contraseña: opcional. Si se completa, debe tener mínimo 3 caracteres. Fecha ingreso: formato AAAA-MM-DD." },
        { texto: "La tienda, el rol Empleado y el estado Activo se asignan automáticamente." },
      ]);
      styleHeader(instructions);
    } else {
      const { data, error } = await readAllResult(supabase.from("usuarios")
        .select("nombres,apellidos,dni,usuario,telefono,fecha_ingreso")
        .eq("tienda_id", actor.tienda_id).in("rol", ["jefe_seguridad", "jefe_area", "seguridad", "caja", "almacenero", "vendedor", "asistente", "trabajador"]).order("nombres"));
      if (error) throw dbError(error);
      sheet.addRows(data.map((row) => ({ ...row, password: "" })));
    }
    styleHeader(sheet);
    sheet.getColumn("dni").numFmt = "@";
    sheet.getColumn("telefono").numFmt = "@";
    return excelResponse(workbook, templateOnly ? "plantilla-usuarios.xlsx" : "usuarios-mi-tienda.xlsx");
  }

  async function exportTiendaExcel(event, id) {
    const query = event.queryStringParameters || {};
    const tipo = query.tipo === "capacitaciones" ? "capacitaciones" : "asistencias";
    const { data: tienda } = await supabase.from("tiendas").select("nombre").eq("id", id).maybeSingle();
    if (!tienda) throw httpError("Tienda no encontrada.", 404);
    const workbook = await createExcelWorkbook();
    if (tipo === "capacitaciones") {
      addCapacitacionesSheet(workbook, "Capacitaciones", await fetchCapacitacionesExport(id, query.desde, query.hasta));
    } else {
      addAsistenciasSheet(workbook, "Asistencias", await fetchAsistenciasExport(id, query.desde, query.hasta));
    }
    return excelResponse(workbook, `${excelSheetName(tienda.nombre)}-${tipo}.xlsx`);
  }

  async function exportMiHistorialExcel(event, user) {
    const query = event.queryStringParameters || {};
    const rows = await fetchAsistenciasExport(user.tienda_id, query.desde, query.hasta);
    const workbook = await createExcelWorkbook();
    addAsistenciasSheet(workbook, "Asistencias", rows);
    return excelResponse(workbook, "mi-tienda-asistencias.xlsx");
  }

  async function exportTodoExcel(event) {
    const query = event.queryStringParameters || {};
    const tipo = query.tipo === "capacitaciones" ? "capacitaciones" : "asistencias";
    const { data: tiendas, error } = await readAllResult(supabase.from("tiendas").select("id,nombre").order("nombre"));
    if (error) throw dbError(error);
    const workbook = await createExcelWorkbook();
    if (!tiendas.length) {
      if (tipo === "capacitaciones") addCapacitacionesSheet(workbook, "Capacitaciones", []);
      else addAsistenciasSheet(workbook, "Asistencias", []);
    }
    for (const tienda of tiendas) {
      const rows = tipo === "capacitaciones"
        ? await fetchCapacitacionesExport(tienda.id, query.desde, query.hasta)
        : await fetchAsistenciasExport(tienda.id, query.desde, query.hasta);
      if (tipo === "capacitaciones") addCapacitacionesSheet(workbook, tienda.nombre, rows);
      else addAsistenciasSheet(workbook, tienda.nombre, rows);
    }
    return excelResponse(workbook, `todas-las-tiendas-${tipo}.xlsx`);
  }

  return { excelSheetName, styleHeader, excelResponse, exportStoreUsersExcel, exportTiendaExcel, exportMiHistorialExcel, exportTodoExcel };
}
