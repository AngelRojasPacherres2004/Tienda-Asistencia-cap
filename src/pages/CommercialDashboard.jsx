import { addDays } from "../../shared/metrics.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Building2, CalendarCheck2, FileClock, GraduationCap, Layers3, Maximize2, RefreshCw, Users } from "lucide-react";
import { api, formatDate, todayISO } from "../lib/api";
import { clusterLabel } from "../lib/clusters";
import { Loading, Notice, StatusBadge } from "../components/UI";
import { TrainingDevelopmentPanel } from "./Dashboard";

const openStates = new Set(["abierta", "pendiente", "en_proceso", "en_atencion"]);
const isCoreCluster = cluster => cluster.estado === "activo" && /^(?:CL[ÚU]STER\s*)?[AB]$/i.test(String(cluster.codigo || cluster.nombre || "").trim());

export default function CommercialDashboard({ onNavigate }) {
  const shellRef = useRef(null);
  const [data,setData] = useState(null), [error,setError] = useState(""), [refreshing,setRefreshing] = useState(false);
  const load = useCallback(() => {
    setRefreshing(true); setError("");
    const today=todayISO(), month=`${today.slice(0,7)}-01`;
    Promise.all([
      api(`/dashboard?desde=${month}&hasta=${today}&rotation_year=${today.slice(0,4)}`),
      api("/tiendas"), api("/clusters"), api("/gerencia/alertas"), api("/reportes/personal").catch(()=>({rows:[]})),
    ]).then(([dashboard,stores,zones,alerts,personnel])=>setData({dashboard,stores,zones,personnel:personnel.rows||[],...alerts})).catch((err)=>setError(err.message)).finally(()=>setRefreshing(false));
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
  if(error) return <Notice type="error">{error}</Notice>;
  if(!data) return <Loading/>;
  const summary=data.dashboard.summary;
  const coreClusterIds=new Set(data.zones.filter(isCoreCluster).map(cluster=>Number(cluster.id)));
  const storePersonnel=data.stores.filter(store=>coreClusterIds.has(Number(store.cluster_id))).map(store=>({
    ...store,
    active:data.personnel.filter(person=>person.tienda===store.nombre&&person.estado==="activo").length,
    total:data.personnel.filter(person=>person.tienda===store.nombre).length,
  })).sort((a,b)=>b.active-a.active||a.nombre.localeCompare(b.nombre,"es"));
  const toggleFullscreen=async()=>{if(document.fullscreenElement) await document.exitFullscreen(); else await shellRef.current?.requestFullscreen();};
  return <section ref={shellRef} className="store-dashboard-shell commercial-dashboard is-light">
    <div className="store-dashboard-topbar"><div><i/><strong>OPERACIÓN COMERCIAL</strong></div><div><button onClick={load}><RefreshCw size={17} className={refreshing?"is-spinning":""}/>Actualizar datos</button><button onClick={toggleFullscreen}><Maximize2 size={17}/>Pantalla completa</button></div></div>
    <header className="store-dashboard-hero"><div><span><Building2 size={38}/></span><div><h1>GESTIÓN ASISTE</h1></div></div><span className="store-dashboard-status"><i/>Datos consultados · {new Date().toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})}</span></header>
    <div className="store-dashboard-body">
      <section className="store-dashboard-personnel-kpis"><CommercialKpi icon={Building2} label="Tiendas activas" value={storePersonnel.filter(store=>store.estado==="activo").length} detail={`${alerts.affected.size} con alertas críticas`}/><CommercialKpi icon={Layers3} label="Clústeres A y B" value={coreClusterIds.size} detail="Tiendas agrupadas por clúster"/><CommercialKpi icon={Users} label="Personal activo" value={storePersonnel.reduce((total,store)=>total+store.active,0)} detail="Dotación registrada de A y B"/></section>
      <section className="store-dashboard-paired-kpis"><CommercialPair label="Alertas operativas" first={{value:alerts.critical.length,label:"Incidencias importantes"}} second={{value:alerts.affected.size,label:"Tiendas que requieren atención"}}/><CommercialPair label="Control documental" first={{value:alerts.expired.length,label:"Documentos vencidos"}} second={{value:alerts.expiring.length,label:"Próximos a vencer"}}/><CommercialPair label="Personas y formación" first={{value:summary.tasa_asistencia_mes == null ? "Sin registros" : `${summary.tasa_asistencia_mes}%`,label:"Asistencia del mes"}} second={{value:alerts.pendingCourses,label:"Capacitaciones pendientes"}}/></section>
      <div className="store-dashboard-actions"><button onClick={()=>onNavigate("tiendas")}><Building2 size={16}/>Tiendas y clústeres</button><button onClick={()=>onNavigate("usuarios")}><Users size={16}/>Consultar personal</button><button onClick={()=>onNavigate("capacitaciones")}><GraduationCap size={16}/>Capacitaciones</button></div>
      <header className="store-dashboard-section"><div><span>Dotación · clústeres A y B</span><h2>Personal por tienda</h2></div></header>
      <div className="commercial-store-personnel"><div className="commercial-store-personnel__head"><span>Tienda</span><span>Clúster</span><span>Activos</span><span>Total</span></div>{storePersonnel.map(store=><div key={store.id}><strong>{store.nombre}</strong><span>{clusterLabel(store.cluster_nombre)}</span><b>{store.active}</b><span>{store.total}</span></div>)}</div>
      <header className="store-dashboard-section"><div><span>Seguimiento prioritario</span><h2>Alertas que requieren acción</h2></div></header>
      <div className="commercial-alert-grid"><CommercialList title="Incidencias importantes" icon={AlertTriangle} rows={alerts.critical.slice(0,6)} empty="No hay incidencias críticas abiertas." render={(row)=><><div><strong>{row.tiendas?.nombre||"Tienda"}</strong><small>{row.asunto||row.tipo||"Incidencia"} · {formatDate(row.fecha)}</small></div><StatusBadge value={row.estado||"abierta"}/></>}/><CommercialList title="Documentos vencidos" icon={FileClock} rows={alerts.expired.slice(0,6)} empty="No hay documentos vencidos." render={(row)=><><div><strong>{row.tipo_documento||"Documento"}</strong><small>Venció {formatDate(row.fecha_vencimiento)}</small></div><span className="commercial-alert-danger">Vencido</span></>}/></div>
      <div className="commercial-alert-action"><button onClick={()=>onNavigate("gestion")}><AlertTriangle size={16}/>Ver todas las incidencias</button></div>
      <header className="store-dashboard-section"><div><span>Indicadores de gestión</span><h2>Asistencia, formación e incidencias</h2></div></header>
      <div className="commercial-progress-grid"><article><span><CalendarCheck2 size={19}/></span><div><small>Presentes hoy</small><strong>{summary.asistencias_hoy}</strong><p>Personas registradas como presentes.</p></div></article><article><span><GraduationCap size={19}/></span><div><small>Capacitaciones en curso</small><strong>{summary.cursos_en_curso}</strong><p>{alerts.pendingCourses} asignaciones pendientes.</p></div></article><article><span><AlertTriangle size={19}/></span><div><small>Incidencias críticas abiertas</small><strong>{alerts.critical.length}</strong><p>{alerts.affected.size} tiendas requieren atención.</p></div></article></div>
      <TrainingDevelopmentPanel rows={data.dashboard.progresoCursos || []} year={todayISO().slice(0,4)} />
    </div>
  </section>;
}

function CommercialKpi({icon:Icon,label,value,detail}){return <article className="store-dashboard-personnel-kpi"><span className="commercial-kpi-icon"><Icon size={20}/></span><div><strong>{label}</strong><small>{detail}</small></div><b>{value}</b></article>}
function CommercialPair({label,first,second}){return <article className="store-dashboard-paired-kpi"><h3>{label}</h3><div><span><strong>{first.value}</strong><small>{first.label}</small></span><span><strong>{second.value}</strong><small>{second.label}</small></span></div></article>}
function CommercialList({title,icon:Icon,rows,empty,render}){return <article className="commercial-alert-panel"><header><span><Icon size={18}/></span><h3>{title}</h3></header>{rows.length?<div>{rows.map((row)=><div className="commercial-alert-row" key={row.id}>{render(row)}</div>)}</div>:<p className="commercial-empty">{empty}</p>}</article>}
