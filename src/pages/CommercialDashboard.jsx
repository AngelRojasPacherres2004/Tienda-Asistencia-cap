import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Building2, CalendarCheck2, FileClock, GraduationCap, Layers3, Maximize2, RefreshCw, Sun, Target, Users } from "lucide-react";
import { api, formatDate, todayISO } from "../lib/api";
import { Loading, Notice, StatusBadge } from "../components/UI";

const openStates = new Set(["abierta", "pendiente", "en_proceso", "en_atencion"]);

export default function CommercialDashboard({ onNavigate }) {
  const shellRef = useRef(null);
  const [data,setData] = useState(null), [error,setError] = useState(""), [refreshing,setRefreshing] = useState(false), [lightMode,setLightMode] = useState(true);
  const load = useCallback(() => {
    setRefreshing(true); setError("");
    const today=todayISO(), month=`${today.slice(0,7)}-01`;
    Promise.all([
      api(`/dashboard?desde=${month}&hasta=${today}&rotation_year=${today.slice(0,4)}`),
      api("/tiendas"), api("/clusters"), api("/incidencias").catch(()=>[]), api("/documentos-tienda").catch(()=>[]),
    ]).then(([dashboard,stores,zones,incidents,documents])=>setData({dashboard,stores,zones,incidents,documents})).catch((err)=>setError(err.message)).finally(()=>setRefreshing(false));
  },[]);
  useEffect(()=>{load();},[load]);
  const alerts=useMemo(()=>{
    if(!data) return {};
    const today=todayISO(), in30=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
    const critical=data.incidents.filter((row)=>row.gravedad==="alta"&&openStates.has(row.estado||"abierta"));
    const expired=data.documents.filter((row)=>row.fecha_vencimiento&&row.fecha_vencimiento<today);
    const expiring=data.documents.filter((row)=>row.fecha_vencimiento&&row.fecha_vencimiento>=today&&row.fecha_vencimiento<=in30);
    const affected=new Set([...critical.map((row)=>row.tienda_id),...expired.map((row)=>row.tienda_id)]);
    const courses=data.dashboard.progresoCursos||[];
    return {critical,expired,expiring,affected,pendingCourses:courses.reduce((sum,row)=>sum+Number(row.pendientes||0),0)};
  },[data]);
  if(error) return <Notice type="error">{error}</Notice>;
  if(!data) return <Loading/>;
  const summary=data.dashboard.summary;
  const toggleFullscreen=async()=>{if(document.fullscreenElement) await document.exitFullscreen(); else await shellRef.current?.requestFullscreen();};
  return <section ref={shellRef} className={`store-dashboard-shell commercial-dashboard ${lightMode?"is-light":""}`}>
    <div className="store-dashboard-topbar"><div><i/><strong>GERENCIA COMERCIAL</strong><span>Vista ejecutiva de tiendas, alertas, asistencia y capacitaciones</span></div><div><button onClick={load}><RefreshCw size={17} className={refreshing?"is-spinning":""}/>Actualizar datos</button><button onClick={()=>setLightMode((value)=>!value)}><Sun size={17}/>{lightMode?"Modo claro":"Modo oscuro"}</button><button onClick={toggleFullscreen}><Maximize2 size={17}/>Pantalla completa</button></div></div>
    <header className="store-dashboard-hero"><div><span><Building2 size={38}/></span><div><h1>PANEL COMERCIAL</h1><p>Situación general de la red de tiendas y alertas que requieren atención</p></div></div><span className="store-dashboard-status"><i/>Datos sincronizados · {new Date().toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})}</span></header>
    <div className="store-dashboard-body">
      <section className="store-dashboard-personnel-kpis"><CommercialKpi icon={Building2} label="Tiendas activas" value={summary.tiendas_activas} detail={`${alerts.affected.size} con alertas críticas`}/><CommercialKpi icon={Layers3} label="Zonas comerciales" value={data.zones.filter((row)=>row.estado==="activo").length} detail="Con jefaturas y tiendas asignadas"/><CommercialKpi icon={Users} label="Personal activo" value={summary.usuarios_activos} detail="Dotación total de tiendas"/></section>
      <section className="store-dashboard-paired-kpis"><CommercialPair label="Alertas operativas" first={{value:alerts.critical.length,label:"Incidencias importantes"}} second={{value:alerts.affected.size,label:"Tiendas que requieren atención"}}/><CommercialPair label="Control documental" first={{value:alerts.expired.length,label:"Documentos vencidos"}} second={{value:alerts.expiring.length,label:"Próximos a vencer"}}/><CommercialPair label="Personas y formación" first={{value:`${summary.tasa_asistencia_mes}%`,label:"Asistencia del mes"}} second={{value:alerts.pendingCourses,label:"Capacitaciones pendientes"}}/></section>
      <div className="store-dashboard-actions"><button onClick={()=>onNavigate("clusters")}><Layers3 size={16}/>Ver zonas</button><button onClick={()=>onNavigate("tiendas")}><Building2 size={16}/>Ver tiendas</button><button onClick={()=>onNavigate("usuarios")}><Users size={16}/>Consultar personal</button><button onClick={()=>onNavigate("gestion")}><AlertTriangle size={16}/>Revisar incidencias</button><button onClick={()=>onNavigate("capacitaciones")}><GraduationCap size={16}/>Capacitaciones</button></div>
      <header className="store-dashboard-section"><div><span>Seguimiento prioritario</span><h2>Alertas que requieren acción</h2></div><p>Incidencias de severidad alta y documentos vencidos en todas las tiendas.</p></header>
      <div className="commercial-alert-grid"><CommercialList title="Incidencias importantes" icon={AlertTriangle} rows={alerts.critical.slice(0,6)} empty="No hay incidencias críticas abiertas." render={(row)=><><div><strong>{row.tiendas?.nombre||"Tienda"}</strong><small>{row.asunto||row.tipo||"Incidencia"} · {formatDate(row.fecha)}</small></div><StatusBadge value={row.estado||"abierta"}/></>}/><CommercialList title="Documentos vencidos" icon={FileClock} rows={alerts.expired.slice(0,6)} empty="No hay documentos vencidos." render={(row)=><><div><strong>{row.nombre||"Documento"}</strong><small>Venció {formatDate(row.fecha_vencimiento)}</small></div><span className="commercial-alert-danger">Vencido</span></>}/></div>
      <header className="store-dashboard-section"><div><span>Indicadores de gestión</span><h2>Asistencia, capacitaciones y metas</h2></div><p>Lectura consolidada para orientar las decisiones comerciales.</p></header>
      <div className="commercial-progress-grid"><article><span><CalendarCheck2 size={19}/></span><div><small>Presentes hoy</small><strong>{summary.asistencias_hoy}</strong><p>Personas registradas como presentes.</p></div></article><article><span><GraduationCap size={19}/></span><div><small>Capacitaciones en curso</small><strong>{summary.cursos_en_curso}</strong><p>{alerts.pendingCourses} asignaciones pendientes.</p></div></article><article><span><Target size={19}/></span><div><small>Metas comerciales</small><strong>0</strong><p>Sin metas configuradas para el periodo actual.</p></div></article></div>
    </div>
  </section>;
}

function CommercialKpi({icon:Icon,label,value,detail}){return <article className="store-dashboard-personnel-kpi"><span className="commercial-kpi-icon"><Icon size={20}/></span><div><strong>{label}</strong><small>{detail}</small></div><b>{value}</b></article>}
function CommercialPair({label,first,second}){return <article className="store-dashboard-paired-kpi"><h3>{label}</h3><div><span><strong>{first.value}</strong><small>{first.label}</small></span><span><strong>{second.value}</strong><small>{second.label}</small></span></div></article>}
function CommercialList({title,icon:Icon,rows,empty,render}){return <article className="commercial-alert-panel"><header><span><Icon size={18}/></span><h3>{title}</h3></header>{rows.length?<div>{rows.map((row)=><button type="button" key={row.id}>{render(row)}</button>)}</div>:<p className="commercial-empty">{empty}</p>}</article>}
