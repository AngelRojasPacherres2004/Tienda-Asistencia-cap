import { addDays } from "../../shared/metrics.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Building2, CalendarCheck2, FileClock, GraduationCap, Users } from "lucide-react";
import { api, formatDate, todayISO } from "../lib/api";
import { clusterLabel } from "../lib/clusters";
import { Loading, Notice, StatusBadge } from "../components/UI";
import { TrainingDevelopmentPanel } from "./Dashboard";
import DashboardFilters from "../components/DashboardFilters";

function dashboardRange(filters, today) {
  const prefix = `${filters.anio}-${filters.mes}`;
  const lastDay = new Date(Number(filters.anio), Number(filters.mes), 0).getDate();
  return filters.dia ? { desde: `${prefix}-${filters.dia}`, hasta: `${prefix}-${filters.dia}` } : { desde: `${prefix}-01`, hasta: prefix === today.slice(0, 7) ? today : `${prefix}-${String(lastDay).padStart(2, "0")}` };
}

const openStates = new Set(["abierta", "pendiente", "en_proceso", "en_atencion"]);
const isCoreCluster = cluster => cluster.estado === "activo" && /^(?:CL[ÚU]STER\s*)?[AB]$/i.test(String(cluster.codigo || cluster.nombre || "").trim());

export default function CommercialDashboard({ onNavigate }) {
  const today = todayISO();
  const [filters, setFilters] = useState({ tienda_id: "", anio: today.slice(0, 4), mes: today.slice(5, 7), dia: "" });
  const selectedRange = useMemo(() => dashboardRange(filters, today), [filters, today]);
  const loadVersion = useRef(0);
  const [data,setData] = useState(null), [error,setError] = useState("");
  const [personnel,setPersonnel] = useState(null), [personnelError,setPersonnelError] = useState("");
  const load = useCallback(() => {
    const version = ++loadVersion.current;
    setError(""); setPersonnelError("");
    const params = new URLSearchParams({ ...selectedRange, rotation_year: filters.anio, ...(filters.tienda_id ? { tienda_id: filters.tienda_id } : {}) });
    Promise.all([
      api(`/dashboard?${params}`),
      api("/tiendas"), api("/clusters"), api("/gerencia/alertas"),
    ]).then(([dashboard,stores,zones,alerts])=>{if(version===loadVersion.current)setData({dashboard,stores,zones,...alerts});}).catch((err)=>{if(version===loadVersion.current)setError(err.message);});
    api("/personal/resumen").then((rows)=>{if(version===loadVersion.current)setPersonnel(rows);}).catch((err)=>{if(version===loadVersion.current)setPersonnelError(err.message);});
  },[selectedRange, filters.anio, filters.tienda_id]);
  useEffect(()=>{load();const version=loadVersion.current;return()=>{loadVersion.current=version+1;};},[load]);
  const alerts=useMemo(()=>{
    if(!data) return {};
    const today=selectedRange.hasta;
    const clusterIds = new Set(data.zones.filter(isCoreCluster).map(cluster=>Number(cluster.id)));
    const storeIds = new Set(data.stores.filter(store=>clusterIds.has(Number(store.cluster_id))&&(!filters.tienda_id||String(store.id)===filters.tienda_id)).map(store=>Number(store.id)));
    const critical=data.incidents.filter((row)=>storeIds.has(Number(row.tienda_id))&&row.fecha>=selectedRange.desde&&String(row.fecha).slice(0,10)<=selectedRange.hasta&&row.gravedad==="alta"&&openStates.has(row.estado||"abierta"));
    const expired=data.documents.filter((row)=>storeIds.has(Number(row.tienda_id))&&row.fecha_vencimiento&&row.fecha_vencimiento<today);
    const expiring=data.documents.filter((row)=>storeIds.has(Number(row.tienda_id))&&row.fecha_vencimiento&&row.fecha_vencimiento>=today&&row.fecha_vencimiento<=addDays(today, Number(row.dias_alerta ?? 30)));
    const affected=new Set([...critical.map((row)=>row.tienda_id),...expired.map((row)=>row.tienda_id)]);
    const courses=data.dashboard.progresoCursos||[];
    return {critical,expired,expiring,affected,pendingCourses:courses.reduce((sum,row)=>sum+Number(row.pendientes||0),0)};
  },[data, filters.tienda_id, selectedRange]);
  if(error) return <div className="commercial-load-error"><Notice type="error">{error}</Notice><button type="button" className="button button--ghost" onClick={load}>Reintentar</button></div>;
  if(!data) return <Loading/>;
  const summary=data.dashboard.summary;
  const attendanceWorkers = data.dashboard.attendanceByWorker || [];
  const attendanceMetrics = [
    { label: "Presentes", count: row => Number(row.presente || 0) + Number(row.tardanza || 0) },
    { label: "Con faltas", count: row => Number(row.ausencia || 0) },
    { label: "Suspendidos", count: row => Number(row.suspension || 0) },
  ].map(metric => ({ ...metric, people: attendanceWorkers.filter(row => metric.count(row) > 0).length, inactive: attendanceWorkers.filter(row => metric.count(row) > 0 && row.estado_actual === "inactivo").length, records: attendanceWorkers.reduce((sum, row) => sum + metric.count(row), 0) }));
  const attendancePeriod = filters.dia ? formatDate(selectedRange.desde) : `${formatDate(selectedRange.desde)} – ${formatDate(selectedRange.hasta)}`;
  const coreClusterIds=new Set(data.zones.filter(isCoreCluster).map(cluster=>Number(cluster.id)));
  const personnelByStore=new Map();
  for (const person of personnel||[]) {
    const storeId=Number(person.tienda_id);
    const count=personnelByStore.get(storeId)||{active:0,total:0};
    count.total++;
    if(person.estado==="activo") count.active++;
    personnelByStore.set(storeId,count);
  }
  const campaignMonth=["02","07","12"].includes(today.slice(5,7));
  const filterStores=data.stores.filter(store=>coreClusterIds.has(Number(store.cluster_id))&&store.estado==="activo");
  const activeStores=filterStores.filter(store=>!filters.tienda_id||String(store.id)===filters.tienda_id);
  const storePersonnel=filterStores.map(store=>{
    const counts=personnelByStore.get(Number(store.id))||{active:0,total:0};
    const base=Number(store.cant_colaboradores_normal)||null;
    const campaign=Number(store.colaboradores_camp)||null;
    const target=campaignMonth&&campaign?campaign:base;
    return {...store,...counts,base,campaign,target,gap:target===null?null:counts.active-target,coverage:target?Math.round(counts.active/target*100):null};
  }).sort((a,b)=>(a.coverage??Infinity)-(b.coverage??Infinity)||a.nombre.localeCompare(b.nombre,"es"));
  const scopedPersonnel=storePersonnel.filter(store=>!filters.tienda_id||String(store.id)===filters.tienda_id);
  const storesBelowTarget=scopedPersonnel.filter(store=>store.gap!==null&&store.gap<0).length;
  return <section className="store-dashboard-shell commercial-dashboard is-light">
    <DashboardFilters filters={filters} setFilters={setFilters} stores={filterStores} range={selectedRange}/>
    <header className="store-dashboard-hero"><div><span><Building2 size={38}/></span><div><h1>GESTIÓN</h1></div></div><span className="store-dashboard-status"><i/>Datos consultados · {new Date().toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})}</span></header>
    <div className="store-dashboard-body">
      <section className="store-dashboard-personnel-kpis"><CommercialKpi icon={Building2} label="Tiendas activas" value={activeStores.length} detail="Clústeres A y B"/><CommercialKpi icon={Users} label="Equipo activo" value={personnel===null?"—":scopedPersonnel.reduce((total,store)=>total+store.active,0)} detail={personnel===null?"Cargando dotación":"Colaboradores de tienda"}/><CommercialKpi icon={AlertTriangle} label="Tiendas por reforzar" value={personnel===null?"—":storesBelowTarget} detail={personnel===null?"Cargando dotación":campaignMonth?"Según meta de campaña":"Según dotación base"}/></section>
      <section className="store-dashboard-paired-kpis commercial-priority-kpis"><CommercialPair label="Alertas operativas" first={{value:alerts.critical.length,label:"Incidencias importantes"}} second={{value:alerts.affected.size,label:"Tiendas que requieren atención"}}/><CommercialPair label="Control documental" first={{value:alerts.expired.length,label:"Documentos vencidos"}} second={{value:alerts.expiring.length,label:"Próximos a vencer"}}/></section>
      <header className="store-dashboard-section"><div><span>Dotación · clústeres A y B</span><h2>Personal por tienda</h2></div></header>
      {personnelError && <Notice type="error">No se pudo cargar la dotación: {personnelError}</Notice>}
      {personnel===null ? !personnelError && <p className="commercial-inline-loading" role="status">Cargando dotación por tienda…</p> : <div className="commercial-store-personnel"><div className="commercial-store-personnel__head"><span>Tienda</span><span>Equipo</span><span>Meta</span><span>Brecha</span><span>Cobertura</span></div>{storePersonnel.map(store=><div key={store.id}><strong>{store.nombre}<small>{clusterLabel(store.cluster_nombre)}{store.campaign&&store.base&&store.campaign>store.base?` · +${store.campaign-store.base} en campaña`:""}</small></strong><b>{store.active}</b><span>{store.target??"—"}</span><span className={store.gap<0?"is-short":""}>{store.gap===null?"Sin meta":store.gap<0?`Faltan ${-store.gap}`:store.gap?`+${store.gap}`:"Completa"}</span><span className="commercial-personnel-coverage">{store.coverage===null?"—":<><i><em style={{width:`${Math.min(store.coverage,100)}%`}}/></i><strong>{store.coverage}%</strong></>}</span></div>)}</div>}
      <header className="store-dashboard-section"><div><span>Seguimiento prioritario</span><h2>Alertas que requieren acción</h2></div></header>
      <div className="commercial-alert-grid"><CommercialList title="Incidencias importantes" icon={AlertTriangle} rows={alerts.critical.slice(0,6)} empty="No hay incidencias críticas abiertas." render={(row)=><><div><strong>{row.tiendas?.nombre||"Tienda"}</strong><small>{row.asunto||row.tipo||"Incidencia"} · {formatDate(row.fecha)}</small></div><StatusBadge value={row.estado||"abierta"}/></>}/><CommercialList title="Documentos vencidos" icon={FileClock} rows={alerts.expired.slice(0,6)} empty="No hay documentos vencidos." render={(row)=><><div><strong>{row.tipo_documento||"Documento"}</strong><small>Venció {formatDate(row.fecha_vencimiento)}</small></div><span className="commercial-alert-danger">Vencido</span></>}/></div>
      <div className="commercial-alert-action"><button onClick={()=>onNavigate("gestion")}><AlertTriangle size={16}/>Ver todas las incidencias</button></div>
      <header className="store-dashboard-section"><div><span>Indicadores de gestión</span><h2>Asistencia, formación e incidencias</h2></div></header>
      <p className="commercial-attendance-period">Asistencia · {attendancePeriod} · {activeStores.length === 1 ? activeStores[0].nombre : "Todas las tiendas"}</p>
      <div className="commercial-progress-grid commercial-attendance-grid">
        <article className="commercial-attendance-card"><header><span><CalendarCheck2 size={19}/></span><h3>Asistencia · personas</h3></header><div className="commercial-attendance-totals">{attendanceMetrics.map(metric => <div key={metric.label}><small>{metric.label}</small><strong>{metric.people}</strong><p>{metric.records} {metric.records === 1 ? "registro" : "registros"}</p>{metric.inactive > 0 && <p>{metric.inactive} actualmente {metric.inactive === 1 ? "inactivo" : "inactivos"}</p>}</div>)}</div><p>Personas distintas por estado, incluyendo quienes salieron de la tienda. Una persona puede figurar en varios estados del periodo.</p></article>
        <article><span><GraduationCap size={19}/></span><div><small>Capacitaciones en curso</small><strong>{summary.cursos_en_curso}</strong><p>{alerts.pendingCourses} asignaciones pendientes.</p></div></article>
      </div>
      <TrainingDevelopmentPanel rows={data.dashboard.progresoCursos || []} year={filters.anio} />
    </div>
  </section>;
}

function CommercialKpi({icon:Icon,label,value,detail}){return <article className="store-dashboard-personnel-kpi"><span className="commercial-kpi-icon"><Icon size={20}/></span><div><strong>{label}</strong><small>{detail}</small></div><b>{value}</b></article>}
function CommercialPair({label,first,second}){return <article className="store-dashboard-paired-kpi"><h3>{label}</h3><div><span><strong>{first.value}</strong><small>{first.label}</small></span><span><strong>{second.value}</strong><small>{second.label}</small></span></div></article>}
function CommercialList({title,icon:Icon,rows,empty,render}){return <article className="commercial-alert-panel"><header><span><Icon size={18}/></span><h3>{title}</h3></header>{rows.length?<div>{rows.map((row)=><div className="commercial-alert-row" key={row.id}>{render(row)}</div>)}</div>:<p className="commercial-empty">{empty}</p>}</article>}
