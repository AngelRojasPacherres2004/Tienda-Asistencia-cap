import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, ShieldAlert, UsersRound } from "lucide-react";
import { api, formatDateTime, todayISO } from "../lib/api";
import { EmptyState, Loading, Notice, PageHeader } from "../components/UI";

export default function Seguridad({ user }) {
  const [traffic, setTraffic] = useState(null);
  const [incidents, setIncidents] = useState(null);
  const [notice, setNotice] = useState(null);
  useEffect(() => { Promise.all([api("/trafico"), api("/incidencias")]).then(([a, b]) => { setTraffic(a); setIncidents(b); }).catch((e) => setNotice({ type: "error", text: e.message })); }, []);
  const todayTraffic = useMemo(() => {
    const records = (traffic || []).filter((row) => row.fecha === todayISO());
    if (!records.length) return null;
    return {
      cantidad: records.reduce((total, row) => total + Number(row.cantidad || 0), 0),
      updated_at: records[0].updated_at,
    };
  }, [traffic]);
  const openIncidents = (incidents || []).filter((r) => r.estado !== "cerrada");
  const activity = useMemo(() => [...(traffic || []).map((r) => ({ date: r.updated_at, text: `Tráfico registrado · ${r.cantidad} visitantes` })), ...(incidents || []).map((r) => ({ date: r.created_at || r.fecha, text: `${r.codigo || `INC-${String(r.id).padStart(4, "0")}`} · ${r.asunto}` }))].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5), [traffic, incidents]);
  if (!traffic || !incidents) return <Loading />;
  const pending = (todayTraffic ? 0 : 1) + openIncidents.length;
  return <>
    <PageHeader eyebrow="Seguridad" title="Inicio" subtitle={`${user?.tienda_nombre || "Tu tienda"} · Control operativo del día`} />
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
    <div className="security-home-layout"><div>
      <div className="security-metrics"><Metric icon={UsersRound} tone="green" label="Tráfico hoy" value={todayTraffic?.cantidad ?? 0} footer={todayTraffic ? `Registrado · ${timeOf(todayTraffic.updated_at)}` : "Registro pendiente"} /><Metric icon={ShieldAlert} tone="amber" label="Incidencias abiertas" value={openIncidents.length} footer={`${openIncidents.filter((r) => r.gravedad === "alta").length} de alta severidad`} /><Metric icon={Clock3} tone="red" label="Pendientes" value={pending} footer={pending ? "Acción requerida" : "Todo al día"} /></div>
      <section className="panel security-pending"><header className="panel__header"><div><h2>Pendientes del día</h2><p>Acciones necesarias para completar la jornada</p></div></header>{todayTraffic ? <Pending tone="done" icon={CheckCircle2} title="Tráfico registrado" detail={`${timeOf(todayTraffic.updated_at || todayTraffic.created_at)} · ${todayTraffic.cantidad} visitantes`} /> : <Pending tone="warning" icon={AlertTriangle} title="Falta registrar el tráfico de hoy" detail="Ingresa a Tráfico para completar el registro diario." />}{openIncidents.slice(0, 3).map((r) => <Pending key={r.id} tone="warning" icon={AlertTriangle} title={`${r.codigo || `INC-${String(r.id).padStart(4, "0")}`} · ${r.asunto}`} detail={`${r.estado || "abierta"} · ${r.gravedad}`} />)}{!openIncidents.length && todayTraffic && <p className="security-all-clear">No hay incidencias pendientes.</p>}</section>
    </div><section className="panel security-activity"><header className="panel__header"><h2>Actividad reciente</h2></header>{activity.length ? activity.map((item, i) => <div className="activity-row" key={`${item.date}-${i}`}><time>{timeOf(item.date)}</time><span>{item.text}</span></div>) : <EmptyState icon={Clock3} title="Sin actividad" text="Los registros recientes aparecerán aquí." />}</section></div>
    <section className="panel security-recent"><header className="panel__header"><div><h2>Incidencias recientes</h2><p>Últimos eventos registrados en la tienda</p></div></header><div className="security-table"><div className="security-table__head"><span>Código</span><span>Fecha</span><span>Tipo</span><span>Severidad</span><span>Estado</span></div>{incidents.slice(0, 6).map((r) => <div className="security-table__row" key={r.id}><strong>{r.codigo || `INC-${String(r.id).padStart(4, "0")}`}</strong><span>{formatDateTime(r.fecha)}</span><span>{r.tipo || r.asunto}</span><span className={`security-pill security-pill--${r.gravedad}`}>{r.gravedad}</span><span className="security-pill">{r.estado || "abierta"}</span></div>)}</div></section>
  </>;
}
function Metric({ icon: Icon, tone, label, value, footer }) { return <article className="security-metric"><span className={`security-metric__icon security-metric__icon--${tone}`}><Icon size={20} /></span><div><small>{label}</small><strong>{value}</strong><em className={`tone-${tone}`}>{footer}</em></div></article>; }
function Pending({ icon: Icon, tone, title, detail }) { return <div className={`pending-row pending-row--${tone}`}><Icon size={18} /><div><strong>{title}</strong><small>{detail}</small></div><span>{tone === "done" ? "Completado" : "Requiere acción"}</span></div>; }
function timeOf(value) { return value ? new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—"; }
