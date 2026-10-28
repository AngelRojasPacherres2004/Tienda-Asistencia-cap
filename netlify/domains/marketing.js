export function createMarketingDomain({ supabase, dbError, readAllResult, todayISO, storeStaffRoles, bodyOf, requireFields, cleanText, httpError }) {
  async function marketingStoreIds(user) {
    const { data: account, error } = await supabase.from("usuarios").select("acceso_todas_tiendas").eq("id", user.id).single();
    if (error) throw dbError(error);
    if (account.acceso_todas_tiendas) return null;
    const { data, error: accessError } = await readAllResult(supabase.from("marketing_tiendas").select("tienda_id").eq("usuario_id", user.id), "tienda_id");
    if (accessError) throw dbError(accessError);
    return (data || []).map((row) => row.tienda_id);
  }

  function marketingScope(request, ids, column = "tienda_id") {
    return ids === null ? request : request.in(column, ids.length ? ids : [0]);
  }

  async function getMarketingDataLegacy(user) {
    const ids = await marketingStoreIds(user);
    let storesQuery = supabase.from("tiendas").select("id,nombre,estado").order("nombre");
    if (ids !== null) storesQuery = storesQuery.in("id", ids.length ? ids : [0]);
    let peopleQuery = supabase.from("usuarios").select("id,nombres,apellidos,rol,tienda_id,estado,tiendas!usuarios_tienda_id_fkey(nombre)").in("rol", storeStaffRoles).order("nombres");
    peopleQuery = marketingScope(peopleQuery, ids);
    const month = `${todayISO().slice(0, 7)}-01`;
    let attendanceQuery = supabase.from("asistencias").select("id,estado,tienda_id,fecha").gte("fecha", month).lte("fecha", todayISO());
    attendanceQuery = marketingScope(attendanceQuery, ids);
    let trafficQuery = supabase.from("trafico_tienda").select("cantidad,tienda_id,fecha").gte("fecha", month).lte("fecha", todayISO());
    trafficQuery = marketingScope(trafficQuery, ids);
    let warningsQuery = supabase.from("amonestaciones").select("*,usuarios!amonestaciones_usuario_id_fkey(nombres,apellidos),tiendas(nombre)").order("fecha", { ascending: false }).limit(100);
    warningsQuery = marketingScope(warningsQuery, ids);
    let errorsQuery = supabase.from("errores_personal").select("*,usuarios!errores_personal_usuario_id_fkey(nombres,apellidos),tiendas(nombre)").order("fecha", { ascending: false }).limit(100);
    errorsQuery = marketingScope(errorsQuery, ids);
    const results = await Promise.all([
      storesQuery, peopleQuery, attendanceQuery, trafficQuery, warningsQuery, errorsQuery,
      supabase.from("campanas_marketing").select("*").order("fecha_inicio", { ascending: false }),
      supabase.from("incidencias_marketing").select("*,tiendas(nombre),campanas_marketing(nombre)").order("created_at", { ascending: false }),
      supabase.from("entregables_marketing").select("*,campanas_marketing(nombre)").order("created_at", { ascending: false }),
      supabase.from("seguidores_redes").select("*").order("fecha", { ascending: false }).limit(200),
      supabase.from("capacitacion_progreso").select("id,estado,tienda_id,fecha_finalizacion,cursos(nombre)").order("updated_at", { ascending: false }).limit(100),
    ]);
    const failed = results.find((result) => result.error);
    if (failed) throw dbError(failed.error);
    const [stores, people, attendance, traffic, warnings, errors, campaigns, incidents, deliverables, followers, trainings] = results.map((result) => result.data || []);
    return {
      stores, people, attendance, traffic, warnings, errors, campaigns, incidents, deliverables, followers,
      trainings: (ids === null ? trainings : trainings.filter((row) => !row.tienda_id || ids.includes(row.tienda_id))).map((row) => ({ ...row, titulo: row.cursos?.nombre || "Capacitación", fecha: row.fecha_finalizacion })),
      access: { allStores: ids === null, storeIds: ids || [] },
    };
  }

  async function createMarketingRecordLegacy(event, user, kind) {
    const data = bodyOf(event);
    if (kind === "campaigns") {
      requireFields(data, ["nombre", "fecha_inicio", "fecha_fin", "rubros", "presupuesto_previsto"]);
      const payload = { nombre: cleanText(data.nombre), descripcion: cleanText(data.descripcion) || null, trabajadores_ids: (data.trabajadores_ids || []).map(Number), tiendas_ids: (data.tiendas_ids || []).map(Number), fecha_inicio: data.fecha_inicio, fecha_fin: data.fecha_fin, rubros: cleanText(data.rubros), presupuesto_previsto: Number(data.presupuesto_previsto), presupuesto_real: data.presupuesto_real === "" || data.presupuesto_real == null ? null : Number(data.presupuesto_real), estado_validacion: data.estado_validacion || "pendiente", validacion_descripcion: cleanText(data.validacion_descripcion) || null, creado_por: user.id };
      const { data: row, error } = await supabase.from("campanas_marketing").insert(payload).select().single(); if (error) throw dbError(error); return row;
    }
    if (kind === "incidents") {
      requireFields(data, ["tipo", "descripcion"]);
      const { data: row, error } = await supabase.from("incidencias_marketing").insert({ tipo:data.tipo, tienda_id:data.tienda_id ? Number(data.tienda_id) : null, campana_id:data.campana_id ? Number(data.campana_id) : null, descripcion:cleanText(data.descripcion), estado:data.estado || "abierta", registrado_por:user.id }).select().single(); if (error) throw dbError(error); return row;
    }
    if (kind === "deliverables") {
      requireFields(data, ["nombre"]);
      const { data: row, error } = await supabase.from("entregables_marketing").insert({ campana_id:data.campana_id ? Number(data.campana_id) : null, nombre:cleanText(data.nombre), responsable:cleanText(data.responsable) || null, fecha_entrega:data.fecha_entrega || null, estado:data.estado || "pendiente", registrado_por:user.id }).select().single(); if (error) throw dbError(error); return row;
    }
    requireFields(data, ["red", "fecha", "cantidad"]);
    const { data: row, error } = await supabase.from("seguidores_redes").upsert({ red:cleanText(data.red), fecha:data.fecha, cantidad:Number(data.cantidad), observaciones:cleanText(data.observaciones) || null, registrado_por:user.id }, { onConflict:"red,fecha" }).select().single(); if (error) throw dbError(error); return row;
  }

  void getMarketingDataLegacy;
  void createMarketingRecordLegacy;

  async function getMarketingData(user) {
    const ids = await marketingStoreIds(user);
    let storesQuery = supabase.from("tiendas").select("id,nombre,estado").order("nombre");
    if (ids !== null) storesQuery = storesQuery.in("id", ids.length ? ids : [0]);
    const peopleResult = await supabase.from("personal_marketing").select("*").eq("creado_por", user.id).order("nombres");
    if (peopleResult.error) throw dbError(peopleResult.error);
    const people = peopleResult.data || [], peopleIds = people.map((row) => row.id);
    const ownedPeople = (request) => request.in("personal_id", peopleIds.length ? peopleIds : [0]);
    const month = `${todayISO().slice(0, 7)}-01`;
    let trafficQuery = supabase.from("trafico_tienda").select("cantidad,tienda_id,fecha").gte("fecha", month).lte("fecha", todayISO());
    trafficQuery = marketingScope(trafficQuery, ids);
    const results = await Promise.all([
      storesQuery, trafficQuery,
      ownedPeople(supabase.from("asistencias_marketing").select("*,personal_marketing(nombres,apellidos)").gte("fecha", month).lte("fecha", todayISO()).order("fecha", { ascending:false })),
      ownedPeople(supabase.from("amonestaciones_marketing").select("*,personal_marketing(nombres,apellidos)").order("fecha", { ascending:false })),
      ownedPeople(supabase.from("errores_marketing").select("*,personal_marketing(nombres,apellidos)").order("fecha", { ascending:false })),
      supabase.from("campanas_marketing").select("*").eq("creado_por", user.id).order("fecha_inicio", { ascending:false }),
      supabase.from("validaciones_marketing").select("*,campanas_marketing!validaciones_marketing_campana_id_fkey(nombre)").eq("registrado_por", user.id).order("created_at", { ascending:false }),
      supabase.from("incidencias_marketing").select("*,tiendas(nombre),campanas_marketing(nombre)").eq("registrado_por", user.id).order("created_at", { ascending:false }),
      supabase.from("entregables_marketing").select("*,campanas_marketing(nombre)").eq("registrado_por", user.id).order("created_at", { ascending:false }),
      supabase.from("seguidores_redes").select("*").eq("registrado_por", user.id).order("fecha", { ascending:false }),
      supabase.from("capacitaciones_marketing").select("*").eq("creado_por", user.id).order("fecha", { ascending:false }),
    ].map(request => readAllResult(request)));
    const failed = results.find((result) => result.error); if (failed) throw dbError(failed.error);
    const [stores,traffic,attendance,warnings,errors,campaigns,validations,incidents,deliverables,followers,trainings] = results.map((result) => result.data || []);
    return { stores,people,traffic,attendance,warnings,errors,campaigns,validations,incidents,deliverables,followers,trainings,access:{allStores:ids===null,storeIds:ids||[]} };
  }

  async function assertMarketingPerson(user, id) {
    const { data,error }=await supabase.from("personal_marketing").select("id").eq("id",Number(id)).eq("creado_por",user.id).maybeSingle();
    if(error)throw dbError(error);if(!data)throw httpError("El colaborador no pertenece al equipo de Marketing.",403);
  }
  async function assertMarketingCampaign(user, id) {
    const { data,error }=await supabase.from("campanas_marketing").select("id").eq("id",Number(id)).eq("creado_por",user.id).maybeSingle();
    if(error)throw dbError(error);if(!data)throw httpError("La campaña no pertenece a este equipo de Marketing.",403);
  }
  const marketingProfileFields = ["tipo_documento", "fecha_salida", "motivo_salida", "fecha_nacimiento", "sueldo", "sexo", "nacionalidad", "direccion", "distrito", "carrera", "grado_academico", "ciclo_semestre", "estado_civil", "numero_hijos", "talla_zapatillas", "talla_polo", "contacto_emergencia", "telefono_emergencia", "alergia", "condicion_salud", "regimen_jornada", "tipo_turno", "tiene_parentesco", "tipo_parentesco", "familiar_vinculo"];
  function marketingStaffProfile(d) {
    const documentLength = d.tipo_documento === "ce" ? 9 : 8;
    if (!new RegExp(`^\\d{${documentLength}}$`).test(d.dni || "")) throw httpError(`El documento debe tener ${documentLength} dígitos.`, 400);
    for (const key of ["telefono", "telefono_emergencia"]) if (d[key] && !/^\d{9}$/.test(d[key])) throw httpError("El teléfono debe tener 9 dígitos.", 400);
    if (d.fecha_salida && (d.fecha_salida < d.fecha_ingreso || !cleanText(d.motivo_salida))) throw httpError("Revisa la fecha y el motivo de salida.", 400);
    if (d.tiene_parentesco && (!d.tipo_parentesco || !cleanText(d.familiar_vinculo))) throw httpError("Completa los datos de parentesco.", 400);
    for (const key of ["sueldo", "numero_hijos", "talla_zapatillas"]) if (d[key] !== "" && d[key] != null && (!Number.isFinite(Number(d[key])) || Number(d[key]) < 0)) throw httpError("Los valores numéricos deben ser positivos.", 400);
    return Object.fromEntries(marketingProfileFields.filter(key => Object.hasOwn(d, key)).map(key => [key, d[key]]));
  }

  async function registerApprovedMarketingCampaign(event, user) {
    const d = bodyOf(event);
    requireFields(d, ["validacion_id", "fecha_inicio", "fecha_fin", "rubros"]);
    const validationResult = await supabase.from("validaciones_marketing").select("*").eq("id", Number(d.validacion_id)).eq("registrado_por", user.id).maybeSingle();
    if (validationResult.error) throw dbError(validationResult.error);
    const validation = validationResult.data;
    if (!validation) throw httpError("La validación no pertenece a este equipo de Marketing.", 403);
    if (validation.estado !== "aprobada") throw httpError("Solo puedes registrar campañas aprobadas en Validación.", 400);
    if (validation.campana_id) throw httpError("Esta validación ya tiene una campaña registrada.", 409);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha_inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(d.fecha_fin) || d.fecha_fin < d.fecha_inicio) throw httpError("Revisa las fechas de inicio y final de la campaña.", 400);
    const realBudget = d.presupuesto_real === "" || d.presupuesto_real == null ? null : Number(d.presupuesto_real);
    if (realBudget !== null && (!Number.isFinite(realBudget) || realBudget < 0)) throw httpError("El presupuesto real debe ser un número positivo.", 400);
    const people = (d.trabajadores_ids || []).map(Number);
    for (const id of people) await assertMarketingPerson(user, id);
    const stores = (d.tiendas_ids || []).map(Number);
    const allowedStores = await marketingStoreIds(user);
    if (allowedStores !== null && stores.some(id => !allowedStores.includes(id))) throw httpError("Selecciona tiendas asignadas a este equipo de Marketing.", 403);
    const result = await supabase.from("campanas_marketing").insert({
      validacion_id: validation.id, nombre: validation.nombre, creado_por: user.id,
      descripcion: cleanText(d.descripcion) || null, rubros: cleanText(d.rubros),
      fecha_inicio: d.fecha_inicio, fecha_fin: d.fecha_fin,
      trabajadores_ids: people, tiendas_ids: stores,
      presupuesto_previsto: Number(validation.presupuesto),
      presupuesto_real: realBudget, registro_completado: true,
      estado_validacion: "aprobada", updated_at: new Date().toISOString(),
    }).select().single();
    if (result.error) throw dbError(result.error);
    if (!result.data) throw httpError("Esta campaña ya está registrada. Actualiza la lista.", 409);
    return result.data;
  }

  async function updateMarketingValidation(event, user, id) {
    const d = bodyOf(event);
    requireFields(d, ["nombre", "descripcion", "presupuesto", "estado"]);
    if (!["aprobada", "cancelada", "pendiente"].includes(d.estado)) throw httpError("Selecciona Aprobado, Cancelado o Pendiente.", 400);
    if (!Number.isFinite(Number(d.presupuesto)) || Number(d.presupuesto) < 0) throw httpError("Revisa el presupuesto de la validación.", 400);
    const result = await supabase.from("validaciones_marketing").update({nombre:cleanText(d.nombre),descripcion:cleanText(d.descripcion),presupuesto:Number(d.presupuesto),estado:d.estado}).eq("id", Number(id)).eq("registrado_por", user.id).is("campana_id", null).select().maybeSingle();
    if (result.error) throw dbError(result.error);
    if (!result.data) throw httpError("La validación no existe o ya tiene una campaña registrada.", 409);
    return result.data;
  }

  async function createMarketingRecord(event,user,kind){
    const d=bodyOf(event); let result;
    if(kind==="staff"){
      requireFields(d,["nombres","apellidos","dni","rol","fecha_ingreso"]);const roles=new Set(["coordinador_marketing","analista_marketing","disenador","community_manager","productor_contenido","promotor_marketing"]);if(!roles.has(d.rol))throw httpError("Selecciona un rol de Marketing válido.",400);
      result=await supabase.from("personal_marketing").insert({nombres:cleanText(d.nombres),apellidos:cleanText(d.apellidos),dni:cleanText(d.dni),telefono:cleanText(d.telefono)||null,email:cleanText(d.email).toLowerCase()||null,rol:d.rol,estado:d.estado||"activo",fecha_ingreso:d.fecha_ingreso,perfil:marketingStaffProfile(d),creado_por:user.id}).select().single();
    }else if(kind==="attendance"){
      requireFields(d,["personal_id","fecha","estado"]);validateMarketingDate(d.fecha);if(!marketingAttendanceStates.has(d.estado))throw httpError("Estado de asistencia inválido.",400);await assertMarketingPerson(user,d.personal_id);result=await supabase.from("asistencias_marketing").upsert({personal_id:Number(d.personal_id),fecha:d.fecha,estado:d.estado,observaciones:cleanText(d.observaciones)||null,registrado_por:user.id},{onConflict:"personal_id,fecha"}).select().single();
    }else if(kind==="validations"){
      if (!["aprobada", "cancelada", "pendiente"].includes(d.estado || "pendiente")) throw httpError("Selecciona Aprobado, Cancelado o Pendiente.", 400);
      requireFields(d,["nombre","descripcion","presupuesto"]);
      if (!Number.isFinite(Number(d.presupuesto)) || Number(d.presupuesto) < 0) throw httpError("Revisa el presupuesto de la validación.",400);
      result=await supabase.from("validaciones_marketing").insert({nombre:cleanText(d.nombre),descripcion:cleanText(d.descripcion),presupuesto:Number(d.presupuesto),estado:d.estado||"pendiente",registrado_por:user.id}).select().single();
    }else if(kind==="trainings"){
      requireFields(d,["titulo","fecha"]);const p=(d.personal_ids||[]).map(Number);for(const id of p)await assertMarketingPerson(user,id);result=await supabase.from("capacitaciones_marketing").insert({titulo:cleanText(d.titulo),descripcion:cleanText(d.descripcion)||null,fecha:d.fecha,instructor:cleanText(d.instructor)||null,estado:d.estado||"programada",personal_ids:p,creado_por:user.id}).select().single();
    }else if(kind==="warnings"){
      requireFields(d,["personal_id","tipo","motivo","fecha"]);await assertMarketingPerson(user,d.personal_id);result=await supabase.from("amonestaciones_marketing").insert({personal_id:Number(d.personal_id),tipo:d.tipo,motivo:cleanText(d.motivo),fecha:d.fecha,registrado_por:user.id}).select().single();
    }else if(kind==="errors"){
      requireFields(d,["personal_id","tipo","error","fecha"]);await assertMarketingPerson(user,d.personal_id);result=await supabase.from("errores_marketing").insert({personal_id:Number(d.personal_id),tipo:d.tipo,error:cleanText(d.error),fecha:d.fecha,registrado_por:user.id}).select().single();
    }else if(kind==="campaigns"){
      requireFields(d,["nombre","fecha_inicio","fecha_fin","rubros","presupuesto_previsto"]);const p=(d.trabajadores_ids||[]).map(Number);for(const id of p)await assertMarketingPerson(user,id);result=await supabase.from("campanas_marketing").insert({nombre:cleanText(d.nombre),descripcion:cleanText(d.descripcion)||null,trabajadores_ids:p,tiendas_ids:(d.tiendas_ids||[]).map(Number),fecha_inicio:d.fecha_inicio,fecha_fin:d.fecha_fin,rubros:cleanText(d.rubros),presupuesto_previsto:Number(d.presupuesto_previsto),presupuesto_real:d.presupuesto_real===""||d.presupuesto_real==null?null:Number(d.presupuesto_real),estado_validacion:"pendiente",creado_por:user.id}).select().single();
    }else if(kind==="incidents"){
      requireFields(d,["tipo","descripcion"]);if(d.campana_id)await assertMarketingCampaign(user,d.campana_id);result=await supabase.from("incidencias_marketing").insert({tipo:d.tipo,tienda_id:d.tienda_id?Number(d.tienda_id):null,campana_id:d.campana_id?Number(d.campana_id):null,descripcion:cleanText(d.descripcion),estado:d.estado||"abierta",registrado_por:user.id}).select().single();
    }else if(kind==="deliverables"){
      requireFields(d,["nombre"]);if(d.campana_id)await assertMarketingCampaign(user,d.campana_id);result=await supabase.from("entregables_marketing").insert({campana_id:d.campana_id?Number(d.campana_id):null,nombre:cleanText(d.nombre),responsable:cleanText(d.responsable)||null,fecha_entrega:d.fecha_entrega||null,estado:d.estado||"pendiente",registrado_por:user.id}).select().single();
    }else if(kind==="followers"){
      requireFields(d,["red","fecha","cantidad"]);result=await supabase.from("seguidores_redes").upsert({red:cleanText(d.red),fecha:d.fecha,cantidad:Number(d.cantidad),observaciones:cleanText(d.observaciones)||null,registrado_por:user.id},{onConflict:"red,fecha"}).select().single();
    }else throw httpError("Tipo de registro de Marketing no válido.",400);
    if(result.error)throw dbError(result.error);return result.data;
  }

  const marketingAttendanceStates = new Set(["presente","tardanza","medio_turno","apoyo","falta","permiso","descanso_medico","suspension"]);
  function validateMarketingDate(fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "") || Number.isNaN(Date.parse(fecha)) || new Date(`${fecha}T12:00:00Z`).toISOString().slice(0,10) !== fecha || fecha > todayISO()) throw httpError("Selecciona una fecha válida, hasta hoy.",400);
  }
  async function marketingAttendance(user, event, method) {
    if (method === "GET") {
      const fecha = event.queryStringParameters?.fecha || todayISO(); validateMarketingDate(fecha);
      const {data,error}=await supabase.from("asistencias_marketing").select("*,personal_marketing!inner(creado_por)").eq("personal_marketing.creado_por",user.id).eq("fecha",fecha);
      if(error)throw dbError(error);return data;
    }
    const {fecha,marcas}=bodyOf(event);validateMarketingDate(fecha);
    if(!Array.isArray(marcas)||!marcas.length||marcas.length>500)throw httpError("Envía entre 1 y 500 marcas.",400);
    const ids=new Set();
    for(const marca of marcas){if(!Number.isSafeInteger(marca.personal_id)||marca.personal_id<=0||ids.has(marca.personal_id)||!marketingAttendanceStates.has(marca.estado))throw httpError("Marca de asistencia inválida.",400);ids.add(marca.personal_id);await assertMarketingPerson(user,marca.personal_id);}
    const {data,error}=await supabase.from("asistencias_marketing").upsert(marcas.map(m=>({personal_id:m.personal_id,fecha,estado:m.estado,observaciones:cleanText(m.observaciones).slice(0,500)||null,registrado_por:user.id})),{onConflict:"personal_id,fecha"}).select("id");
    if(error)throw dbError(error);return {actualizados:data.length};
  }
  async function changeMarketingStaff(event,user,id,method){
    await assertMarketingPerson(user,id);
    let query=supabase.from("personal_marketing");
    if(method==="DELETE")query=query.delete();
    else{
      const d=bodyOf(event);if(!["activo","inactivo"].includes(d.estado))throw httpError("Estado de personal inválido.",400);
      let payload={estado:d.estado};
      if(method==="PUT"){
        requireFields(d,["nombres","apellidos","dni","rol","fecha_ingreso"]);
        if(!["coordinador_marketing","analista_marketing","disenador","community_manager","productor_contenido","promotor_marketing"].includes(d.rol))throw httpError("Rol de Marketing inválido.",400);
        payload={...payload,nombres:cleanText(d.nombres),apellidos:cleanText(d.apellidos),dni:cleanText(d.dni),rol:d.rol,fecha_ingreso:d.fecha_ingreso,perfil:marketingStaffProfile(d),telefono:cleanText(d.telefono)||null,email:cleanText(d.email).toLowerCase()||null};
      }
      if(d.fecha_salida)payload.estado="inactivo";
      query=query.update(payload);
    }
    const {data,error}=await query.eq("id",Number(id)).eq("creado_por",user.id).select("id").single();if(error)throw dbError(error);return data;
  }

  return { getMarketingData, createMarketingRecord, registerApprovedMarketingCampaign, updateMarketingValidation, marketingAttendance, changeMarketingStaff };
}
