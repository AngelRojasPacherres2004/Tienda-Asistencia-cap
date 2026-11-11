import { addDays } from "../../shared/metrics.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, FileClock, GraduationCap, Users } from "lucide-react";
import { api, formatDate, todayISO } from "../lib/api";
import { clusterLabel } from "../lib/clusters";
import { Loading, Notice } from "../components/UI";
import { TrainingDevelopmentPanel } from "./Dashboard";
import { commercialSummaryRanges, mergeCommercialSummaries } from "../lib/commercialSummaryFilters";
import DashboardFilters from "../components/DashboardFilters";

function dashboardRange(filters, today) {
  const prefix = `${filters.anio}-${filters.mes}`;
  const lastDay = new Date(Number(filters.anio), Number(filters.mes), 0).getDate();
  return filters.dia ? { desde: `${prefix}-${filters.dia}`, hasta: `${prefix}-${filters.dia}` } : { desde: `${prefix}-01`, hasta: prefix === today.slice(0, 7) ? today : `${prefix}-${String(lastDay).padStart(2, "0")}` };
}

const isCoreCluster = cluster => cluster.estado === "activo" && /^(?:CL[ÚU]STER\s*)?[AB]$/i.test(String(cluster.codigo || cluster.nombre || "").trim());

export default function CommercialDashboard({ embedded = false, renderSections, dashboardFilters }) {
  const today = todayISO();
  const [filters, setFilters] = useState({ tienda_id: "", anio: today.slice(0, 4), mes: today.slice(5, 7), dia: "" });
  const externalFilterKey = JSON.stringify(dashboardFilters || null);
  const ranges = useMemo(() => {
    const external = JSON.parse(externalFilterKey);
    return embedded && external ? commercialSummaryRanges(external, today) : [dashboardRange(filters, today)];
  }, [embedded, externalFilterKey, filters, today]);
  const selectedRange = { desde: ranges[0]?.desde, hasta: ranges.at(-1)?.hasta };
  const effectiveYear = dashboardFilters?.year || filters.anio;
  const loadVersion = useRef(0);
  const [data,setData] = useState(null), [error,setError] = useState("");
  const [personnel,setPersonnel] = useState(null), [personnelError,setPersonnelError] = useState("");
  const load = useCallback(() => {
    const version = ++loadVersion.current;
    setError(""); setPersonnelError("");
    const dashboardRequests = ranges.map(range => {
      const params = new URLSearchParams({ ...range, rotation_year: effectiveYear, ...(filters.tienda_id ? { tienda_id: filters.tienda_id } : {}) });
      return api(`/dashboard?${params}`);
    });
    Promise.all([
      Promise.all(dashboardRequests).then(mergeCommercialSummaries),
      api("/tiendas"), api("/clusters"), api("/gerencia/alertas"),
    ]).then(([dashboard,stores,zones,alerts])=>{if(version===loadVersion.current)setData({dashboard,stores,zones,...alerts});}).catch((err)=>{if(version===loadVersion.current)setError(err.message);});
    api("/personal/resumen").then((rows)=>{if(version===loadVersion.current)setPersonnel(rows);}).catch((err)=>{if(version===loadVersion.current)setPersonnelError(err.message);});
  },[ranges, effectiveYear, filters.tienda_id]);
  useEffect(()=>{load();const version=loadVersion.current;return()=>{loadVersion.current=version+1;};},[load]);
  const alerts=useMemo(()=>{
    if(!data) return {};
    const today=selectedRange.hasta;
    const clusterIds = new Set(data.zones.filter(isCoreCluster).map(cluster=>Number(cluster.id)));
    const storeIds = new Set(data.stores.filter(store=>clusterIds.has(Number(store.cluster_id))&&(!filters.tienda_id||String(store.id)===filters.tienda_id)).map(store=>Number(store.id)));
    const expired=data.documents.filter((row)=>storeIds.has(Number(row.tienda_id))&&row.fecha_vencimiento&&row.fecha_vencimiento<today);
    const expiring=data.documents.filter((row)=>storeIds.has(Number(row.tienda_id))&&row.fecha_vencimiento&&row.fecha_vencimiento>=today&&row.fecha_vencimiento<=addDays(today, Number(row.dias_alerta ?? 30)));
    const courses=data.dashboard.progresoCursos||[];
    return {expired,expiring,pendingCourses:courses.reduce((sum,row)=>sum+Number(row.pendientes||0),0)};
  },[data, filters.tienda_id, selectedRange.hasta]);
  if(error && embedded) return renderSections({ overview: <div className="commercial-load-error"><Notice type="error">{error}</Notice><button type="button" className="button button--ghost" onClick={load}>Reintentar</button></div> });
  if(!data && embedded) return renderSections({ overview: <Loading/> });
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
  const sections = {
    overview: <div className="manager-summary-group">
      <section className="store-dashboard-personnel-kpis"><CommercialKpi icon={Building2} label="Tiendas activas" value={activeStores.length} detail="Clústeres A y B"/><CommercialKpi icon={Users} label="Equipo activo" value={personnel===null?"—":scopedPersonnel.reduce((total,store)=>total+store.active,0)} detail={personnel===null?"Cargando dotación":"Colaboradores de tienda"}/></section>
</div>,
    personnel: <div className="manager-summary-group">      <header className="store-dashboard-section"><div><span>Dotación · clústeres A y B</span><h2>Personal por tienda</h2></div></header>
      {personnelError && <Notice type="error">No se pudo cargar la dotación: {personnelError}</Notice>}
      {personnel===null ? !personnelError && <p className="commercial-inline-loading" role="status">Cargando dotación por tienda…</p> : <div className="commercial-store-personnel"><div className="commercial-store-personnel__head"><span>Tienda</span><span>Equipo</span><span>Meta</span><span>Brecha</span><span>Cobertura</span></div>{scopedPersonnel.map(store=><div key={store.id}><strong>{store.nombre}<small>{clusterLabel(store.cluster_nombre)}{store.campaign&&store.base&&store.campaign>store.base?` · +${store.campaign-store.base} en campaña`:""}</small></strong><b>{store.active}</b><span>{store.target??"—"}</span><span className={store.gap<0?"is-short":""}>{store.gap===null?"Sin meta":store.gap<0?`Faltan ${-store.gap}`:store.gap?`+${store.gap}`:"Completa"}</span><span className="commercial-personnel-coverage">{store.coverage===null?"—":<><i><em style={{width:`${Math.min(store.coverage,100)}%`}}/></i><strong>{store.coverage}%</strong></>}</span></div>)}</div>}
</div>,
    alerts: <div className="manager-summary-group">      <section className="store-dashboard-paired-kpis commercial-priority-kpis"><CommercialPair label="Control documental" first={{value:alerts.expired.length,label:"Documentos vencidos"}} second={{value:alerts.expiring.length,label:"Próximos a vencer"}}/></section>
      <CommercialDocuments expired={alerts.expired} expiring={alerts.expiring} stores={data.stores}/>
</div>,
    training: <div className="manager-summary-group">
      <div className="commercial-progress-grid"><article><span><GraduationCap size={19}/></span><div><small>Capacitaciones en curso</small><strong>{summary.cursos_en_curso}</strong><p>{alerts.pendingCourses} asignaciones pendientes.</p></div></article></div>
      <TrainingDevelopmentPanel rows={data.dashboard.progresoCursos || []} year={effectiveYear} />
</div>,
  };
  if (embedded && renderSections) return renderSections(sections);
  return <section className="store-dashboard-shell commercial-dashboard is-light">
    <DashboardFilters filters={filters} setFilters={setFilters} stores={filterStores} range={selectedRange}/>
    <header className="store-dashboard-hero"><div><span><Building2 size={38}/></span><div><h1>GESTIÓN</h1></div></div><span className="store-dashboard-status"><i/>Datos consultados · {new Date().toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})}</span></header>
    <div className="store-dashboard-body">
      {sections.overview}{sections.alerts}{sections.personnel}{sections.training}
    </div>
  </section>;
}

function CommercialKpi({icon:Icon,label,value,detail}){return <article className="store-dashboard-personnel-kpi"><span className="commercial-kpi-icon"><Icon size={20}/></span><div><strong>{label}</strong><small>{detail}</small></div><b>{value}</b></article>}
function CommercialDocuments({ expired, expiring, stores }) {
  const rows = [...expired.map(row => ({ ...row, expired: true })), ...expiring.map(row => ({ ...row, expired: false }))]
    .sort((a, b) => Number(b.expired) - Number(a.expired) || a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));
  const storeNames = new Map(stores.map(store => [String(store.id), store.nombre]));
  return <article className="commercial-alert-panel commercial-documents">
    <header><span><FileClock size={18}/></span><h3>Documentos vencidos y por vencer</h3></header>
    {rows.length ? <div className="commercial-documents__scroll"><table>
      <thead><tr><th scope="col">Tienda</th><th scope="col">Documento</th><th scope="col">Vencimiento</th><th scope="col">Estado</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <td>{storeNames.get(String(row.tienda_id)) || row.tiendas?.nombre || "Tienda sin identificar"}</td>
        <td>{row.tipo_documento || "Documento"}</td>
        <td>{formatDate(row.fecha_vencimiento)}</td>
        <td><span className={row.expired ? "commercial-alert-danger" : "commercial-document-warning"}>{row.expired ? "Vencido" : "Por vencer"}</span></td>
      </tr>)}</tbody>
    </table></div> : <p className="commercial-empty">No hay documentos vencidos ni por vencer.</p>}
  </article>;
}
function CommercialPair({label,first,second}){return <article className="store-dashboard-paired-kpi"><h3>{label}</h3><div><span><strong>{first.value}</strong><small>{first.label}</small></span><span><strong>{second.value}</strong><small>{second.label}</small></span></div></article>}
