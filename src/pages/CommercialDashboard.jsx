import { addDays } from "../../shared/metrics.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CalendarCheck2, FileClock, GraduationCap, Users } from "lucide-react";
import { api, formatDate, todayISO } from "../lib/api";
import { clusterLabel } from "../lib/clusters";
import { Loading, Notice, StatusBadge } from "../components/UI";
import { TrainingDevelopmentPanel } from "./Dashboard";

const openStates = new Set(["abierta", "pendiente", "en_proceso", "en_atencion"]);
const isCoreCluster = cluster => cluster.estado === "activo" && /^(?:CL[ÚU]STER\s*)?[AB]$/i.test(String(cluster.codigo || cluster.nombre || "").trim());

export default function CommercialDashboard({ onNavigate }) {
  const [data,setData] = useState(null), [error,setError] = useState("");
  const [personnel,setPersonnel] = useState(null), [personnelError,setPersonnelError] = useState("");
  const load = useCallback(() => {
    setError(""); setPersonnelError(""); setPersonnel(null);
    const today=todayISO(), month=`${today.slice(0,7)}-01`;
    Promise.all([
      api(`/dashboard?desde=${month}&hasta=${today}&rotation_year=${today.slice(0,4)}`),
      api("/tiendas"), api("/clusters"), api("/gerencia/alertas"),
    ]).then(([dashboard,stores,zones,alerts])=>setData({dashboard,stores,zones,...alerts})).catch((err)=>setError(err.message));
    api("/personal/resumen").then((rows)=>setPersonnel(rows)).catch((err)=>setPersonnelError(err.message));
  },[]);
  useEffect(()=>{load();},[load]);
  const alerts=useMemo(()=>{
    if(!data) return {};
    const today=todayISO();
    const clusterIds = new Set(data.zones.filter(isCoreCluster).map(cluster=>Number(cluster.id)));
    const storeIds = new Set(data.stores.filter(store=>clusterIds.has(Number(store.cluster_id))).map(store=>Number(store.id)));
    const critical=data.incidents.filter((row)=>storeIds.has(Number(row.tienda_id))&&row.gravedad==="alta"&&openStates.has(row.estado||"abierta"));
    const expired=data.documents.filter((row)=>storeIds.has(Number(row.tienda_id))&&row.fecha_vencimiento&&row.fecha_vencimiento<today);
    const expiring=data.documents.filter((row)=>storeIds.has(Number(row.tienda_id))&&row.fecha_vencimiento&&row.fecha_vencimiento>=today&&row.fecha_vencimiento<=addDays(today, Number(row.dias_alerta ?? 30)));
    const affected=new Set([...critical.map((row)=>row.tienda_id),...expired.map((row)=>row.tienda_id)]);
    const courses=data.dashboard.progresoCursos||[];
    return {critical,expired,expiring,affected,pendingCourses:courses.reduce((sum,row)=>sum+Number(row.pendientes||0),0)};
  },[data]);
  if(error) return <div className="commercial-load-error"><Notice type="error">{error}</Notice><button type="button" className="button button--ghost" onClick={load}>Reintentar</button></div>;
  if(!data) return <Loading/>;
  const summary=data.dashboard.summary;
  const coreClusterIds=new Set(data.zones.filter(isCoreCluster).map(cluster=>Number(cluster.id)));
  const personnelByStore=new Map();
  for (const person of personnel||[]) {
    const storeId=Number(person.tienda_id);
    const count=personnelByStore.get(storeId)||{active:0,total:0};
    count.total++;
    if(person.estado==="activo") count.active++;
    personnelByStore.set(storeId,count);
  }
  const campaignMonth=["02","07","12"].includes(todayISO().slice(5,7));
  const activeStores=data.stores.filter(store=>coreClusterIds.has(Number(store.cluster_id))&&store.estado==="activo");
  const storePersonnel=activeStores.map(store=>{
    const counts=personnelByStore.get(Number(store.id))||{active:0,total:0};
    const base=Number(store.cant_colaboradores_normal)||null;
    const campaign=Number(store.colaboradores_camp)||null;
    const target=campaignMonth&&campaign?campaign:base;
    return {...store,...counts,base,campaign,target,gap:target===null?null:counts.active-target,coverage:target?Math.round(counts.active/target*100):null};
  }).sort((a,b)=>(a.coverage??Infinity)-(b.coverage??Infinity)||a.nombre.localeCompare(b.nombre,"es"));
  const storesBelowTarget=storePersonnel.filter(store=>store.gap!==null&&store.gap<0).length;
  return <section className="store-dashboard-shell commercial-dashboard is-light">
    <header className="store-dashboard-hero"><div><span><Building2 size={38}/></span><div><h1>GESTIÓN ASISTE</h1></div></div><span className="store-dashboard-status"><i/>Datos consultados · {new Date().toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})}</span></header>
    <div className="store-dashboard-body">
      <section className="store-dashboard-personnel-kpis"><CommercialKpi icon={Building2} label="Tiendas activas" value={activeStores.length} detail="Clústeres A y B"/><CommercialKpi icon={Users} label="Equipo activo" value={personnel===null?"—":storePersonnel.reduce((total,store)=>total+store.active,0)} detail={personnel===null?"Cargando dotación":"Colaboradores de tienda"}/><CommercialKpi icon={AlertTriangle} label="Tiendas por reforzar" value={personnel===null?"—":storesBelowTarget} detail={personnel===null?"Cargando dotación":campaignMonth?"Según meta de campaña":"Según dotación base"}/></section>
      <section className="store-dashboard-paired-kpis commercial-priority-kpis"><CommercialPair label="Alertas operativas" first={{value:alerts.critical.length,label:"Incidencias importantes"}} second={{value:alerts.affected.size,label:"Tiendas que requieren atención"}}/><CommercialPair label="Control documental" first={{value:alerts.expired.length,label:"Documentos vencidos"}} second={{value:alerts.expiring.length,label:"Próximos a vencer"}}/></section>
      <div className="store-dashboard-actions"><button onClick={()=>onNavigate("tiendas")}><Building2 size={16}/>Tiendas y clústeres</button><button onClick={()=>onNavigate("usuarios")}><Users size={16}/>Consultar personal</button><button onClick={()=>onNavigate("capacitaciones")}><GraduationCap size={16}/>Capacitaciones</button></div>
      <header className="store-dashboard-section"><div><span>Dotación · clústeres A y B</span><h2>Personal por tienda</h2></div></header>
      {personnelError && <Notice type="error">No se pudo cargar la dotación: {personnelError}</Notice>}
      {personnel===null ? !personnelError && <p className="commercial-inline-loading" role="status">Cargando dotación por tienda…</p> : <div className="commercial-store-personnel"><div className="commercial-store-personnel__head"><span>Tienda</span><span>Equipo</span><span>Meta</span><span>Brecha</span><span>Cobertura</span></div>{storePersonnel.map(store=><div key={store.id}><strong>{store.nombre}<small>{clusterLabel(store.cluster_nombre)}{store.campaign&&store.base&&store.campaign>store.base?` · +${store.campaign-store.base} en campaña`:""}</small></strong><b>{store.active}</b><span>{store.target??"—"}</span><span className={store.gap<0?"is-short":""}>{store.gap===null?"Sin meta":store.gap<0?`Faltan ${-store.gap}`:store.gap?`+${store.gap}`:"Completa"}</span><span className="commercial-personnel-coverage">{store.coverage===null?"—":<><i><em style={{width:`${Math.min(store.coverage,100)}%`}}/></i><strong>{store.coverage}%</strong></>}</span></div>)}</div>}
      <header className="store-dashboard-section"><div><span>Seguimiento prioritario</span><h2>Alertas que requieren acción</h2></div></header>
      <div className="commercial-alert-grid"><CommercialList title="Incidencias importantes" icon={AlertTriangle} rows={alerts.critical.slice(0,6)} empty="No hay incidencias críticas abiertas." render={(row)=><><div><strong>{row.tiendas?.nombre||"Tienda"}</strong><small>{row.asunto||row.tipo||"Incidencia"} · {formatDate(row.fecha)}</small></div><StatusBadge value={row.estado||"abierta"}/></>}/><CommercialList title="Documentos vencidos" icon={FileClock} rows={alerts.expired.slice(0,6)} empty="No hay documentos vencidos." render={(row)=><><div><strong>{row.tipo_documento||"Documento"}</strong><small>Venció {formatDate(row.fecha_vencimiento)}</small></div><span className="commercial-alert-danger">Vencido</span></>}/></div>
      <div className="commercial-alert-action"><button onClick={()=>onNavigate("gestion")}><AlertTriangle size={16}/>Ver todas las incidencias</button></div>
      <header className="store-dashboard-section"><div><span>Indicadores de gestión</span><h2>Asistencia, formación e incidencias</h2></div></header>
      <div className="commercial-progress-grid"><article><span><CalendarCheck2 size={19}/></span><div><small>Presentes hoy</small><strong>{summary.asistencias_hoy}</strong></div></article><article><span><GraduationCap size={19}/></span><div><small>Capacitaciones en curso</small><strong>{summary.cursos_en_curso}</strong><p>{alerts.pendingCourses} asignaciones pendientes.</p></div></article></div>
      <TrainingDevelopmentPanel rows={data.dashboard.progresoCursos || []} year={todayISO().slice(0,4)} />
    </div>
  </section>;
}

function CommercialKpi({icon:Icon,label,value,detail}){return <article className="store-dashboard-personnel-kpi"><span className="commercial-kpi-icon"><Icon size={20}/></span><div><strong>{label}</strong><small>{detail}</small></div><b>{value}</b></article>}
function CommercialPair({label,first,second}){return <article className="store-dashboard-paired-kpi"><h3>{label}</h3><div><span><strong>{first.value}</strong><small>{first.label}</small></span><span><strong>{second.value}</strong><small>{second.label}</small></span></div></article>}
function CommercialList({title,icon:Icon,rows,empty,render}){return <article className="commercial-alert-panel"><header><span><Icon size={18}/></span><h3>{title}</h3></header>{rows.length?<div>{rows.map((row)=><div className="commercial-alert-row" key={row.id}>{render(row)}</div>)}</div>:<p className="commercial-empty">{empty}</p>}</article>}
