import { AlertTriangle, BarChart3, CalendarCheck2, ClipboardCheck, Megaphone, TrendingUp, Users } from "lucide-react";
import { EmptyState, StatusBadge } from "../components/UI";
import { formatDate } from "../lib/api";

const money = value => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(value || 0));
const number = value => new Intl.NumberFormat("es-PE").format(value || 0);

export default function MarketingHome({ data, metrics }) {
  const pending = data.validations.filter(row => row.estado === "pendiente").length;
  const incidents = data.incidents.filter(row => row.estado !== "cerrada").length;
  const campaigns = [...data.campaigns].sort((a, b) => String(b.created_at || b.fecha_inicio).localeCompare(String(a.created_at || a.fecha_inicio))).slice(0, 5);
  return <div className="marketing-home">
    <div className="marketing-home__metrics">
      {[
        [TrendingUp, "Presupuesto ejecutado", money(metrics.budget), "Inversión real en campañas"],
        [Megaphone, "Campañas", number(metrics.campaigns), "Campañas del equipo"],
        [Users, "Personal activo", number(metrics.people), "Colaboradores de Marketing"],
        [BarChart3, "Tráfico de tiendas", number(metrics.traffic), "Visitas registradas este mes"],
      ].map(([Icon, label, value, detail]) => <article className="marketing-home__metric" key={label}>
        <div className="marketing-home__metric-top"><span><Icon size={20}/></span><h2>{label}</h2></div>
        <strong>{value}</strong><p>{detail}</p>
      </article>)}
    </div>
    <div className="marketing-home__grid">
      <section className="panel marketing-home__campaigns">
        <header className="marketing-home__panel-header"><div><span className="marketing-home__eyebrow">Actividad reciente</span><h2>Campañas recientes</h2><p>Últimas campañas registradas por el equipo.</p></div><span className="marketing-home__count">{number(metrics.campaigns)} en total</span></header>
        {campaigns.length ? <div className="marketing-home__campaign-list">{campaigns.map(campaign => <article key={campaign.id} className="marketing-home__campaign">
          <span className="marketing-home__campaign-icon"><Megaphone size={18}/></span>
          <div className="marketing-home__campaign-info"><h3>{campaign.nombre}</h3><p>{campaign.rubros}</p><small>{formatDate(campaign.fecha_inicio)} — {formatDate(campaign.fecha_fin)}</small></div>
          <div className="marketing-home__campaign-budget"><small>Presupuesto inicial</small><strong>{money(campaign.presupuesto_previsto)}</strong></div>
        </article>)}</div> : <EmptyState icon={Megaphone} title="Aún no hay campañas" text="Registra una validación y, cuando esté aprobada, completa la campaña."/>}
      </section>
      <section className="panel marketing-home__summary">
        <header className="marketing-home__panel-header"><div><span className="marketing-home__eyebrow">Operación del equipo</span><h2>Resumen del área</h2><p>Asistencia y tareas por atender.</p></div></header>
        <div className="marketing-home__attendance"><div><span><CalendarCheck2 size={17}/>Asistencia del mes</span><strong>{metrics.attendance}%</strong></div><div className="marketing-home__progress" role="progressbar" aria-label="Asistencia del mes" aria-valuenow={metrics.attendance} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${metrics.attendance}%` }}/></div><p>{data.attendance.length ? "Porcentaje de registros con presencia o tardanza." : "Todavía no hay registros de asistencia este mes."}</p></div>
        <div className="marketing-home__pending"><span><ClipboardCheck size={18}/>Validaciones pendientes</span><strong>{pending}</strong></div>
        <div className="marketing-home__pending"><span><AlertTriangle size={18}/>Incidencias abiertas</span><strong>{incidents}</strong></div>
        <footer className="marketing-home__summary-footer"><StatusBadge value={pending || incidents ? "pendiente" : "activo"} label={pending || incidents ? "Hay pendientes por atender" : "Sin pendientes por atender"}/></footer>
      </section>
    </div>
  </div>;
}
