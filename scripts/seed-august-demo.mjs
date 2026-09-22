import { loadEnv } from "vite";

const env = loadEnv("development", process.cwd(), "");
const base = `${env.SUPABASE_URL}/rest/v1`;
const headers = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, "Content-Type": "application/json" };
if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY.");

async function request(path, options = {}) {
  const response = await fetch(`${base}/${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const get = (path) => request(path);
const insert = (table, rows) => rows.length ? request(table, { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(rows) }) : null;
const insertReturning = (table, rows) => rows.length ? request(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(rows) }) : [];
const dates = Array.from({ length: 31 }, (_, index) => `2026-08-${String(index + 1).padStart(2, "0")}`);
const profiles = [
  [1, "Lucía", "Mendoza", "vendedor"], [2, "Diego", "Salazar", "caja"],
  [3, "Valeria", "Rojas", "seguridad"], [4, "Mateo", "Campos", "almacenero"],
];
const password = "!SIN_ACCESO!";

const stores = (await get("tiendas?select=id,nombre,estado,jefe_id,cluster_id&estado=eq.activo")).sort((a, b) => a.id - b.id);
const initialUsers = await get("usuarios?select=id,dni,usuario,rol,estado,tienda_id,fecha_ingreso,fecha_salida");
const userKeys = new Set(initialUsers.flatMap((item) => [item.dni, item.usuario?.toLowerCase()].filter(Boolean)));
const demoUsers = stores.flatMap((store) => profiles.map(([number, nombres, apellidos, rol]) => ({
  nombres, apellidos, dni: String(70000000 + store.id * 10 + number), usuario: `demo.t${store.id}.${number}`,
  password, telefono: String(900000000 + store.id * 10 + number), rol, tienda_id: store.id,
  estado: "activo", fecha_ingreso: "2026-07-01",
}))).filter((item) => !userKeys.has(item.dni) && !userKeys.has(item.usuario));
await insert("usuarios", demoUsers);

const users = await get("usuarios?select=id,nombres,apellidos,rol,estado,tienda_id,fecha_ingreso,fecha_salida&estado=eq.activo&tienda_id=not.is.null");
const demoStaff = users.filter((item) => item.fecha_ingreso <= "2026-08-31" && (!item.fecha_salida || item.fecha_salida >= "2026-08-01"));
const registrars = new Map(stores.map((store) => [store.id, users.find((user) => user.id === store.jefe_id)?.id || users.find((user) => user.tienda_id === store.id)?.id]));

const currentAttendance = await get("asistencias?select=usuario_id,fecha&fecha=gte.2026-08-01&fecha=lte.2026-08-31");
const attendanceKeys = new Set(currentAttendance.map((item) => `${item.usuario_id}-${item.fecha}`));
const attendance = demoStaff.flatMap((user) => dates.map((fecha) => {
  const day = Number(fecha.slice(-2)); const sunday = new Date(`${fecha}T12:00:00Z`).getUTCDay() === 0;
  const missing = (user.id + day) % 19 === 0; const late = (user.id + day) % 11 === 0; const half = (user.id + day) % 23 === 0;
  const estado = sunday ? "permiso" : missing ? "falta" : late ? "tardanza" : half ? "medio_turno" : "presente";
  return { usuario_id:user.id, tienda_id:user.tienda_id, fecha, estado,
    hora_entrada:sunday||missing?null:late?"09:12:00":"08:55:00", hora_salida:sunday||missing?null:half?"14:00:00":"18:05:00",
    observaciones:sunday?"Descanso semanal programado":missing?"Ausencia reportada al administrador":late?"Ingreso posterior al horario programado":"Carga demo agosto 2026",
    registrado_por:registrars.get(user.tienda_id) };
})).filter((item) => item.registrado_por && !attendanceKeys.has(`${item.usuario_id}-${item.fecha}`));
await insert("asistencias", attendance);

const currentTraffic = (await Promise.all(stores.map((store)=>get(`trafico_tienda?select=tienda_id,fecha,rango_hora&tienda_id=eq.${store.id}&fecha=gte.2026-08-01&fecha=lte.2026-08-31`)))).flat();
const trafficKeys = new Set(currentTraffic.map((item) => `${item.tienda_id}-${item.fecha}-${item.rango_hora}`));
const traffic = stores.flatMap((store) => dates.flatMap((fecha) => Array.from({ length: 13 }, (_, offset) => {
  const hour=9+offset, day=Number(fecha.slice(-2)), weekend=[0,6].includes(new Date(`${fecha}T12:00:00Z`).getUTCDay());
  const range=`${String(hour).padStart(2,"0")}:00-${String(hour+1).padStart(2,"0")}:00`;
  return { tienda_id:store.id, fecha, hora:`${String(hour).padStart(2,"0")}:00:00`, rango_hora:range,
    cantidad:Math.max(4,10+((store.id*7+day*3+hour*5)%34)+(hour>=17&&hour<=20?18:0)+(weekend?12:0)),
    observaciones:weekend?"Mayor afluencia por fin de semana":"Flujo habitual de agosto", registrado_por:registrars.get(store.id) };
}))).filter((item)=>item.registrado_por&&!trafficKeys.has(`${item.tienda_id}-${item.fecha}-${item.rango_hora}`));
for (let index=0; index<traffic.length; index+=400) await insert("trafico_tienda", traffic.slice(index,index+400));

const currentLogs = await get("bitacora_tienda?select=tienda_id,fecha&fecha=gte.2026-08-01&fecha=lte.2026-08-31");
const logKeys = new Set(currentLogs.map((item)=>`${item.tienda_id}-${item.fecha}`));
const logs=stores.flatMap((store)=>dates.map((fecha)=>{const day=Number(fecha.slice(-2)),weekend=[0,6].includes(new Date(`${fecha}T12:00:00Z`).getUTCDay());return{
  tienda_id:store.id,fecha,venta_dia:4200+((store.id*311+day*487)%7600),trafico:180+((store.id*19+day*23)%390),categoria:weekend?"Fin de semana":"Operación diaria",
  evento:day%10===0?"Activación comercial":"Jornada regular",descripcion:"Cierre operativo y comercial simulado de agosto 2026.",creado_por:registrars.get(store.id)};})).filter((item)=>item.creado_por&&!logKeys.has(`${item.tienda_id}-${item.fecha}`));
await insert("bitacora_tienda",logs);

const clusters = await get("clusters?select=id,jefe_zonal_id");
const leaders = new Map(clusters.map((item)=>[item.id,item.jefe_zonal_id]));
const currentVisits = await get("visitas_zonales?select=id,tienda_id,periodo&periodo=like.Agosto%25Demo%25");
const visitStores = new Set(currentVisits.map((item)=>item.tienda_id));
const visits = stores.filter((store)=>store.cluster_id&&leaders.get(store.cluster_id)&&!visitStores.has(store.id)).map((store)=>({
  tienda_id:store.id,jefe_zonal_id:leaders.get(store.cluster_id),fecha:`2026-08-${String(8+(store.id%3)*6).padStart(2,"0")}`,
  periodo:"Agosto 2026 · Demo",puntaje:76+(store.id%20),observacion_general:"Visita mensual: operación estable con oportunidades puntuales de mejora.",
}));
await insert("visitas_zonales",visits);
const demoVisits=await get("visitas_zonales?select=id,tienda_id,fecha&periodo=eq.Agosto%202026%20%C2%B7%20Demo");
const currentFindings=await get("observaciones_zonales?select=visita_id&visita_id=not.is.null");
const findingVisits=new Set(currentFindings.map((item)=>item.visita_id));
const findings=demoVisits.filter((visit)=>!findingVisits.has(visit.id)).map((visit)=>({visita_id:visit.id,tienda_id:visit.tienda_id,
  area_item:visit.tienda_id%2===0?"Documentación":"Sala de ventas",prioridad:visit.tienda_id%3===0?"alta":"media",fecha_limite:`2026-08-${String(Math.min(31,Number(visit.fecha.slice(-2))+7)).padStart(2,"0")}`,
  descripcion:visit.tienda_id%2===0?"Ordenar y actualizar el archivo documental.":"Corregir señalización y presentación del área.",accion_solicitada:"Presentar evidencia del levantamiento al jefe zonal.",
  estado:visit.tienda_id%3===0?"en_validacion":"levantada",comentario:"Registro demostrativo para el flujo de supervisión."}));
await insert("observaciones_zonales",findings);

const existingImprovements=await get("mejoras_continuas?select=tienda_id&que_mejoro=like.%5BDEMO%20AGO%202026%5D%25");
const improvementStores=new Set(existingImprovements.map((item)=>item.tienda_id));
const improvements=stores.filter((store)=>!improvementStores.has(store.id)).map((store)=>({tienda_id:store.id,fecha:"2026-08-25",seccion:"Operaciones",area:"Sala de ventas",responsable:"Equipo de tienda",
  que_mejoro:"[DEMO AGO 2026] Distribución de productos de alta rotación",como_se_hizo:"Se reorganizaron exhibiciones usando el tráfico por hora y la rotación del mes.",estado:"completada",resultado_beneficio:"Mejor visibilidad y reposición más rápida.",creado_por:registrars.get(store.id)}));
await insert("mejoras_continuas",improvements);

const existingRequirements=await get("requerimientos_tienda?select=tienda_id&comentario=eq.%5BDEMO%20AGO%202026%5D");
const requirementStores=new Set(existingRequirements.map((item)=>item.tienda_id));
const requirements=stores.filter((store)=>!requirementStores.has(store.id)).map((store)=>({tienda_id:store.id,requerimiento:"Reposición de material de señalización",cantidad:6,areas_responsables:["Operaciones","Marketing"],urgencia:"corto_plazo",fecha_inicio:"2026-08-18",fecha_fin_objetivo:"2026-08-28",estado:"atendido",comentario:"[DEMO AGO 2026]",creado_por:registrars.get(store.id)}));
await insert("requerimientos_tienda",requirements);

const existingTasks=await get("tareas_zonales?select=tienda_id,titulo&titulo=like.%5BDEMO%20AGO%202026%5D%25");
const taskKeys=new Set(existingTasks.map((item)=>`${item.tienda_id}-${item.titulo}`));
const tasks=stores.flatMap((store)=>Array.from({length:5},(_,index)=>({jefe_zonal_id:leaders.get(store.cluster_id),tienda_id:store.id,
  titulo:`[DEMO AGO 2026] Control semanal ${index+1}`,descripcion:"Validar asistencia, tráfico, documentos y pendientes de la semana.",responsable:"Administrador de tienda",
  fecha_inicio:`2026-08-${String(1+index*6).padStart(2,"0")}`,fecha_limite:`2026-08-${String(Math.min(31,6+index*6)).padStart(2,"0")}`,prioridad:index%2?"alta":"media",estado:index<4?"completada":"en_progreso"})))
  .filter((item)=>item.jefe_zonal_id&&!taskKeys.has(`${item.tienda_id}-${item.titulo}`));
await insert("tareas_zonales",tasks);

const existingActions=await get("acciones_tienda?select=tienda_id,accion&accion=like.%5BDEMO%20AGO%202026%5D%25");
const actionStores=new Set(existingActions.map((item)=>item.tienda_id));
const actions=stores.filter((store)=>!actionStores.has(store.id)).flatMap((store)=>[
  {tienda_id:store.id,fecha:"2026-08-05",tipo:"Operación",responsable:"Administrador",accion:"[DEMO AGO 2026] Revisión de apertura y caja",estado:"completada",objetivo:"Cumplir el checklist diario",observacion:"Sin diferencias",creado_por:registrars.get(store.id)},
  {tienda_id:store.id,fecha:"2026-08-14",tipo:"Visual",responsable:"Equipo de ventas",accion:"[DEMO AGO 2026] Actualización de exhibiciones",estado:"completada",objetivo:"Mejorar conversión",observacion:"Se priorizó alta rotación",creado_por:registrars.get(store.id)},
  {tienda_id:store.id,fecha:"2026-08-27",tipo:"Inventario",responsable:"Almacén",accion:"[DEMO AGO 2026] Conteo cíclico de productos",estado:"en_progreso",objetivo:"Reducir diferencias",observacion:"Pendiente validación final",creado_por:registrars.get(store.id)},
]);
await insert("acciones_tienda",actions);

const existingClaims=await get("reclamaciones_tienda?select=tienda_id,codigo_hoja&codigo_hoja=like.DEMO-AGO-%25");
const claimKeys=new Set(existingClaims.map((item)=>item.codigo_hoja));
const claims=stores.flatMap((store)=>[1,2].map((number)=>({tienda_id:store.id,codigo_hoja:`DEMO-AGO-${store.id}-${number}`,fecha:`2026-08-${number===1?'09':'23'}`,consumidor_nombre:number===1?"María Fernández":"José Ramírez",consumidor_documento:`71${store.id}00${number}45`,consumidor_contacto:`987650${store.id}${number}1`,producto_servicio:number===1?"Calzado deportivo":"Atención en caja",monto:number===1?249.9:null,tipo:number===1?"reclamo":"queja",detalle:number===1?"Solicita cambio por talla disponible.":"Tiempo de espera mayor al esperado.",pedido_consumidor:number===1?"Cambio de talla":"Mejorar tiempo de atención",acciones_adoptadas:"Se contactó al cliente y se brindó solución.",fecha_respuesta:`2026-08-${number===1?'11':'24'}`,responsable:"Administrador de tienda",estado:"cerrado",creado_por:registrars.get(store.id)}))).filter((item)=>!claimKeys.has(item.codigo_hoja));
await insert("reclamaciones_tienda",claims);

const existingMunicipal=await get("documentos_municipales?select=tienda_id,codigo&codigo=like.DEMO-AGO-%25");
const municipalKeys=new Set(existingMunicipal.map((item)=>item.codigo));
const municipalDocs=stores.flatMap((store)=>[
  ["ITSE","Defensa Civil","Anual","2026-08-03","2027-08-03","vigente"],
  ["EXT","Mantenimiento de extintores","Semestral","2026-08-10","2027-02-10","vigente"],
  ["FUM","Certificado de fumigación","Trimestral","2026-08-18","2026-11-18","vigente"],
].map((doc,index)=>({tienda_id:store.id,area_responsable:index===0?"Administración":"Seguridad",responsables:index===0?["Administrador de tienda"]:["Jefe de seguridad","Administrador de tienda"],codigo:`DEMO-AGO-${store.id}-${doc[0]}`,tipo_documento:doc[1],frecuencia_revision:doc[2],fecha_emision:doc[3],fecha_vencimiento:doc[4],estado:doc[5],creado_por:registrars.get(store.id)}))).filter((item)=>!municipalKeys.has(item.codigo));
await insert("documentos_municipales",municipalDocs);

const existingErrors=await get("errores_personal?select=tienda_id,descripcion&descripcion=like.%5BDEMO%20AGO%202026%5D%25");
const errorStores=new Set(existingErrors.map((item)=>item.tienda_id));
const errors=stores.filter((store)=>!errorStores.has(store.id)).flatMap((store)=>{
  const team=demoStaff.filter((person)=>person.tienda_id===store.id); return team.slice(0,2).map((person,index)=>({tienda_id:store.id,usuario_id:person.id,fecha:index?"2026-08-19":"2026-08-07",categoria:index?"Atención al cliente":"Procedimiento de caja",descripcion:index?"[DEMO AGO 2026] No registró el cierre de atención.":"[DEMO AGO 2026] Diferencia menor detectada en arqueo.",accion_correctiva:index?"Retroalimentación y seguimiento.":"Reconteo y repaso del procedimiento.",registrado_por:registrars.get(store.id)}));});
await insert("errores_personal",errors);

const existingWarnings=await get("amonestaciones?select=tienda_id,motivo&motivo=like.%5BDEMO%20AGO%202026%5D%25");
const warningStores=new Set(existingWarnings.map((item)=>item.tienda_id));
const warnings=stores.filter((store)=>!warningStores.has(store.id)).map((store)=>{const person=demoStaff.find((item)=>item.tienda_id===store.id);return{tienda_id:store.id,usuario_id:person.id,tipo:"verbal",motivo:"[DEMO AGO 2026] Incumplimiento puntual de procedimiento interno.",fecha:"2026-08-20",registrado_por:registrars.get(store.id)};});
await insert("amonestaciones",warnings);

const existingIncidents=await get("incidencias?select=tienda_id,descripcion&descripcion=like.%5BDEMO%20AGO%202026%5D%25");
const incidentStores=new Set(existingIncidents.map((item)=>item.tienda_id));
const incidentRows=stores.filter((store)=>!incidentStores.has(store.id)).flatMap((store)=>{
  const security=demoStaff.find((person)=>person.tienda_id===store.id&&person.rol==="seguridad")?.id||registrars.get(store.id);
  return [
    {tienda_id:store.id,fecha:"2026-08-16T18:40:00-05:00",asunto:"Robo de producto",tipo:"robo",area:"piso_venta",descripcion:"[DEMO AGO 2026] Se detectó la sustracción de un producto durante hora punta.",gravedad:"alta",estado:"cerrada",intervencion:true,detencion:true,detencion_detalle:"Se retuvo a la persona hasta la llegada de la autoridad y se entregó la evidencia.",registrado_por:security,notificacion_estado:"enviada"},
    {tienda_id:store.id,fecha:"2026-08-24T11:20:00-05:00",asunto:"Falla en equipo de caja",tipo:"falla_interna",area:"caja",descripcion:"[DEMO AGO 2026] Intermitencia del lector durante la apertura.",gravedad:"media",estado:"cerrada",intervencion:false,detencion:false,detencion_detalle:null,registrado_por:registrars.get(store.id),notificacion_estado:"enviada"},
  ];
});
const createdIncidents=await insertReturning("incidencias",incidentRows);
let brands=await get("marcas?select=id,nombre");
if(!brands.some((item)=>item.nombre==="Nissei Demo")){await insert("marcas",[{nombre:"Nissei Demo"}]);brands=await get("marcas?select=id,nombre");}
const demoBrand=brands.find((item)=>item.nombre==="Nissei Demo");
const incidentProducts=createdIncidents.filter((item)=>item.tipo==="robo").map((item)=>({incidencia_id:item.id,marca_id:demoBrand.id,producto:"Zapatilla urbana modelo AX",cantidad:1,valor:279.9,recuperado:true}));
await insert("incidencia_productos",incidentProducts);

const courses=await get("cursos?select=id&activo=eq.true&order=id.asc&limit=4");
const existingProgress=await get("capacitacion_progreso?select=curso_id,usuario_id");
const progressKeys=new Set(existingProgress.map((item)=>`${item.curso_id}-${item.usuario_id}`));
const progress=demoStaff.flatMap((person)=>courses.map((course,index)=>({curso_id:course.id,usuario_id:person.id,tienda_id:person.tienda_id,estado:index%3===0?"en_curso":"completado",duracion_horas:2+(index%2),fecha_finalizacion:index%3===0?null:`2026-08-${String(12+index*3).padStart(2,"0")}`,actualizado_por:registrars.get(person.tienda_id),nota:index%3===0?null:14+((person.id+index)%7)}))).filter((item)=>!progressKeys.has(`${item.curso_id}-${item.usuario_id}`));
await insert("capacitacion_progreso",progress);

console.log(JSON.stringify({ tiendas:stores.length, usuarios_demo_creados:demoUsers.length, asistencias_creadas:attendance.length, trafico_creado:traffic.length, bitacoras_creadas:logs.length,
  visitas_creadas:visits.length,observaciones_creadas:findings.length,mejoras_creadas:improvements.length,requerimientos_creados:requirements.length,tareas_creadas:tasks.length,
  acciones_creadas:actions.length,reclamaciones_creadas:claims.length,documentos_creados:municipalDocs.length,errores_creados:errors.length,amonestaciones_creadas:warnings.length,
  incidencias_creadas:createdIncidents.length,productos_incidencia_creados:incidentProducts.length,progresos_capacitacion_creados:progress.length }, null, 2));
