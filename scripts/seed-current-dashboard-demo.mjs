import { loadEnv } from "vite";

const env=loadEnv("development",process.cwd(),"");
const base=`${env.SUPABASE_URL}/rest/v1`;
const headers={apikey:env.SUPABASE_SECRET_KEY,Authorization:`Bearer ${env.SUPABASE_SECRET_KEY}`,"Content-Type":"application/json"};
async function request(path,options={}){const response=await fetch(`${base}/${path}`,{...options,headers:{...headers,...(options.headers||{})}});const text=await response.text();if(!response.ok)throw new Error(`${path}: ${response.status} ${text}`);return text?JSON.parse(text):null;}
const get=(path)=>request(path);
const insert=(table,rows)=>rows.length?request(table,{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(rows)}):null;
const dates=Array.from({length:22},(_,index)=>`2026-09-${String(index+1).padStart(2,"0")}`);

const stores=await get("tiendas?select=id,nombre,estado,jefe_id,cluster_id&estado=eq.activo");
const users=await get("usuarios?select=id,nombres,apellidos,rol,estado,tienda_id,fecha_ingreso,fecha_salida&estado=eq.activo&tienda_id=not.is.null");
const demoStaff=users.filter((item)=>item.usuario?.startsWith?.("demo.t")||["vendedor","caja","seguridad","almacenero"].includes(item.rol));
const registrars=new Map(stores.map((store)=>[store.id,users.find((user)=>user.id===store.jefe_id)?.id||users.find((user)=>user.tienda_id===store.id)?.id]));

const attendanceExisting=await get("asistencias?select=usuario_id,fecha&fecha=gte.2026-09-01&fecha=lte.2026-09-22");
const attendanceKeys=new Set(attendanceExisting.map((item)=>`${item.usuario_id}-${item.fecha}`));
const attendance=demoStaff.flatMap((user)=>dates.map((fecha)=>{const day=Number(fecha.slice(-2)),sunday=new Date(`${fecha}T12:00:00Z`).getUTCDay()===0,missing=(user.id+day)%21===0,late=(user.id+day)%9===0;const estado=sunday?"permiso":missing?"falta":late?"tardanza":"presente";return{usuario_id:user.id,tienda_id:user.tienda_id,fecha,estado,hora_entrada:sunday||missing?null:late?"09:10:00":"08:54:00",hora_salida:sunday||missing?null:"18:04:00",observaciones:sunday?"Descanso semanal":missing?"Ausencia comunicada":late?"Demora por transporte":"Operación normal",registrado_por:registrars.get(user.tienda_id)};})).filter((item)=>item.registrado_por&&!attendanceKeys.has(`${item.usuario_id}-${item.fecha}`));
for(let index=0;index<attendance.length;index+=400)await insert("asistencias",attendance.slice(index,index+400));

const trafficExisting=(await Promise.all(stores.map((store)=>get(`trafico_tienda?select=tienda_id,fecha,rango_hora&tienda_id=eq.${store.id}&fecha=gte.2026-09-01&fecha=lte.2026-09-22`)))).flat();
const trafficKeys=new Set(trafficExisting.map((item)=>`${item.tienda_id}-${item.fecha}-${item.rango_hora}`));
const traffic=stores.flatMap((store)=>dates.flatMap((fecha)=>Array.from({length:13},(_,offset)=>{const hour=9+offset,day=Number(fecha.slice(-2)),weekend=[0,6].includes(new Date(`${fecha}T12:00:00Z`).getUTCDay()),range=`${String(hour).padStart(2,"0")}:00-${String(hour+1).padStart(2,"0")}:00`;return{tienda_id:store.id,fecha,hora:`${String(hour).padStart(2,"0")}:00:00`,rango_hora:range,cantidad:12+((store.id*9+day*4+hour*3)%38)+(hour>=17&&hour<=20?20:0)+(weekend?10:0),observaciones:hour>=17&&hour<=20?"Franja de mayor afluencia":"Flujo regular",registrado_por:registrars.get(store.id)};}))).filter((item)=>item.registrado_por&&!trafficKeys.has(`${item.tienda_id}-${item.fecha}-${item.rango_hora}`));
for(let index=0;index<traffic.length;index+=400)await insert("trafico_tienda",traffic.slice(index,index+400));

const logExisting=await get("bitacora_tienda?select=tienda_id,fecha&fecha=gte.2026-09-01&fecha=lte.2026-09-22");
const logKeys=new Set(logExisting.map((item)=>`${item.tienda_id}-${item.fecha}`));
const logs=stores.flatMap((store)=>dates.map((fecha)=>{const day=Number(fecha.slice(-2));return{tienda_id:store.id,fecha,venta_dia:5100+((store.id*431+day*517)%8400),trafico:210+((store.id*29+day*31)%420),categoria:"Operación diaria",evento:day%7===0?"Campaña comercial":"Jornada regular",descripcion:"Cierre diario de demostración para el dashboard.",creado_por:registrars.get(store.id)};})).filter((item)=>item.creado_por&&!logKeys.has(`${item.tienda_id}-${item.fecha}`));
await insert("bitacora_tienda",logs);

const docsExisting=await get("documentos_tienda?select=tienda_id,numero&numero=like.DASH-DEMO-%25");
const docKeys=new Set(docsExisting.map((item)=>item.numero));
const documents=stores.flatMap((store)=>[
  {tienda_id:store.id,nombre:"Certificado de Defensa Civil",numero:`DASH-DEMO-${store.id}-ITSE`,entidad_emisora:"Municipalidad",fecha_emision:"2026-03-10",fecha_vencimiento:"2026-10-10",notas:"Próximo a renovación",registrado_por:registrars.get(store.id)},
  {tienda_id:store.id,nombre:"Mantenimiento de extintores",numero:`DASH-DEMO-${store.id}-EXT`,entidad_emisora:"Proveedor autorizado",fecha_emision:"2026-04-01",fecha_vencimiento:"2026-10-01",notas:"Renovación coordinada",registrado_por:registrars.get(store.id)},
]).filter((item)=>item.registrado_por&&!docKeys.has(item.numero));
await insert("documentos_tienda",documents);

const clusters=await get("clusters?select=id,jefe_zonal_id");const leaders=new Map(clusters.map((item)=>[item.id,item.jefe_zonal_id]));
const taskExisting=await get("tareas_zonales?select=tienda_id,titulo&titulo=like.%5BDASHBOARD%20SEP%202026%5D%25");const taskKeys=new Set(taskExisting.map((item)=>`${item.tienda_id}-${item.titulo}`));
const tasks=stores.flatMap((store)=>[1,2,3].map((number)=>({jefe_zonal_id:leaders.get(store.cluster_id),tienda_id:store.id,titulo:`[DASHBOARD SEP 2026] Prioridad ${number}`,descripcion:number===1?"Validar reporte de asistencia del mes.":number===2?"Revisar documentos próximos a vencer.":"Cerrar observaciones de supervisión.",responsable:number===3?"Administrador y jefe zonal":"Administrador de tienda",fecha_inicio:`2026-09-${String(10+number).padStart(2,"0")}`,fecha_limite:`2026-09-${String(22+number).padStart(2,"0")}`,prioridad:number===3?"alta":"media",estado:number===1?"completada":"en_progreso"}))).filter((item)=>item.jefe_zonal_id&&!taskKeys.has(`${item.tienda_id}-${item.titulo}`));
await insert("tareas_zonales",tasks);

console.log(JSON.stringify({asistencias_creadas:attendance.length,trafico_creado:traffic.length,bitacoras_creadas:logs.length,documentos_creados:documents.length,tareas_creadas:tasks.length},null,2));
