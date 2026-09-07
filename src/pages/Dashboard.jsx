import { useEffect, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Building2, CheckCircle2, Clock3, GraduationCap, UsersRound } from "lucide-react";
import { api, estadoAsistenciaLabels } from "../lib/api";
import { Loading, Notice, PageHeader } from "../components/UI";

const palette = {
  presente: "#2f9e78", tardanza: "#c9932f", medio_turno: "#df9f39", apoyo: "#4f8dc9",
  falta: "#d9635f", permiso: "#7668ba", descanso_medico: "#8d96a3", suspension: "#a54f4f",
};
const tooltipStyle = { color: "#f3eee5", background: "#171719", border: "1px solid rgba(206,169,92,.3)", borderRadius: 12, boxShadow: "0 12px 30px rgba(0,0,0,.35)", fontSize: 12 };

function Metric({ icon: Icon, label, value, note, tone }) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__top"><span><Icon size={20} /></span><small>{label}</small></div>
      <strong>{value ?? 0}</strong><p>{note}</p>
    </article>
  );
}

export default function Dashboard({ user }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const isAdmin = user?.rol === "admin";
  useEffect(() => { api("/dashboard").then(setData).catch((err) => setError(err.message)); }, []);
  if (error) return <Notice type="error">{error}</Notice>;
  if (!data) return <Loading />;
  const workloadTotal = data.workload.reduce((sum, item) => sum + item.total, 0);

  return (
    <>
      <PageHeader eyebrow="Centro de control" title="Buenos días" subtitle="Una lectura clara de lo que está ocurriendo hoy." />
      <section className="metrics-grid">
        {isAdmin && <Metric icon={Building2} label="Tiendas" value={data.summary.tiendas_activas} note="Activas" tone="violet" />}
        <Metric icon={UsersRound} label={isAdmin ? "Equipo activo" : "Mi equipo"} value={data.summary.usuarios_activos} note="Usuarios habilitados" tone="blue" />
        <Metric icon={CheckCircle2} label="Presentes hoy" value={data.summary.asistencias_hoy} note="Registrados como presente" tone="green" />
        <Metric icon={Clock3} label="Asistencia del mes" value={`${data.summary.tasa_asistencia_mes}%`} note="Tasa de presentes" tone="amber" />
        <Metric icon={GraduationCap} label="Capacitaciones" value={data.summary.cursos_en_curso} note="En curso" tone="red" />
      </section>

      <section className="dashboard-grid">
        <article className="panel panel--wide">
          <header className="panel__header"><div><h2>Ritmo de asistencia</h2><p>Tasa de presentes por mes</p></div><span className="panel-tag">Últimos 12 meses</span></header>
          <div className="chart chart--large">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend}>
                <defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#cda85f" stopOpacity={.32} /><stop offset="100%" stopColor="#cda85f" stopOpacity={.02} /></linearGradient></defs>
                <CartesianGrid stroke="#2a2926" vertical={false} />
                <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: "#9f9789", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "#9f9789", fontSize: 11 }} unit="%" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="tasa" stroke="#d6b56f" strokeWidth={2.5} fill="url(#trendFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className="panel">
          <header className="panel__header"><div><h2>Estado del mes</h2><p>Distribución de asistencias</p></div></header>
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={210}>
              <PieChart><Pie data={data.states} dataKey="cantidad" nameKey="estado" innerRadius={60} outerRadius={82} paddingAngle={3}>
                {data.states.map((item) => <Cell key={item.estado} fill={palette[item.estado] || "#8d96a3"} />)}
              </Pie><Tooltip contentStyle={tooltipStyle} /></PieChart>
            </ResponsiveContainer>
            <div className="donut-center"><strong>{data.states.reduce((sum, item) => sum + item.cantidad, 0)}</strong><small>Total</small></div>
          </div>
          <div className="chart-legend">{data.states.map((item) => <span key={item.estado}><i style={{ background: palette[item.estado] }} />{estadoAsistenciaLabels[item.estado] || item.estado}<strong>{item.cantidad}</strong></span>)}</div>
        </article>
        <article className="panel panel--wide">
          <header className="panel__header"><div><h2>{isAdmin ? "Asistencia por tienda" : "Asistencia por empleado"}</h2><p>Este mes</p></div></header>
          <div className="chart chart--medium">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.workload} barGap={2}>
                <CartesianGrid stroke="#2a2926" vertical={false} />
                <XAxis dataKey="nombre" axisLine={false} tickLine={false} tick={{ fill: "#9f9789", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "#9f9789", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="presentes" stackId="a" fill="#2f9e78" radius={[0, 0, 4, 4]} />
                <Bar dataKey="otros" stackId="a" fill="#df9f39" />
                <Bar dataKey="faltas" stackId="a" fill="#d9635f" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {!workloadTotal && <div className="panel-empty"><CheckCircle2 size={24} /><span>Aún no hay asistencias registradas este mes.</span></div>}
        </article>
        <article className="panel">
          <header className="panel__header"><div><h2>Progreso de capacitaciones</h2><p>Cursos con más pendientes</p></div></header>
          <div className="due-list">
            {data.progresoCursos.length ? data.progresoCursos.map((item, index) => {
              const total = item.completados + item.en_curso + item.pendientes;
              const porcentaje = total ? Math.round((item.completados / total) * 100) : 0;
              return (
                <div key={`${item.titulo}-${index}`}>
                  <span className={`due-days ${item.pendientes > 0 ? "urgent" : ""}`}>{porcentaje}%</span>
                  <div><strong>{item.titulo}</strong><small>{item.completados} completados · {item.en_curso} en curso · {item.pendientes} pendientes</small></div>
                </div>
              );
            }) : <div className="panel-empty"><CheckCircle2 size={24} /><span>Todavía no hay cursos en el catálogo.</span></div>}
          </div>
        </article>
      </section>
    </>
  );
}
