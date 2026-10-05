import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { countWorkdays } from "../../shared/metrics.js";

const formatNumber = (value) => Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: 1 });
const attendanceRate = (row) => row.marcas ? `${Math.round(row.asistentes / row.marcas * 100)}%` : "Sin marcas";

export default function GeneralManagementOverview({ data, periodLabel }) {
  const [clusterId, setClusterId] = useState("");
  const clusters = data.clusters || [];
  const stores = data.tiendas || [];
  const selectedCluster = clusters.find((cluster) => String(cluster.id) === clusterId);
  const visibleStores = stores.filter((store) => !clusterId || String(store.cluster_id || 0) === clusterId).sort((a, b) => b.visitas - a.visitas || a.nombre.localeCompare(b.nombre, "es"));
  const days = Math.max(1, countWorkdays(data.desde, data.hasta));
  const totals = clusters.reduce((sum, cluster) => ({ tiendas: sum.tiendas + cluster.tiendas, personal: sum.personal + cluster.personal, asistentes: sum.asistentes + cluster.asistentes, faltas: sum.faltas + cluster.faltas, pendientes: sum.pendientes + cluster.pendientes, marcas: sum.marcas + cluster.marcas, visitas: sum.visitas + cluster.visitas, incidencias: sum.incidencias + cluster.incidencias, errores: sum.errores + cluster.errores }), { tiendas: 0, personal: 0, asistentes: 0, faltas: 0, pendientes: 0, marcas: 0, visitas: 0, incidencias: 0, errores: 0 });
  const largest = Math.max(...clusters.map((cluster) => cluster.visitas), 1);
  const chartRows = clusters.map(cluster => ({
    ...cluster,
    visitas: cluster.conteos_trafico ? cluster.visitas : null,
    asistencia_sin_tardanza: cluster.asistentes - cluster.tardanzas,
    otros: Math.max(0, cluster.marcas - cluster.asistentes - cluster.faltas),
  }));
  const chartHeight = Math.max(220, clusters.length * 56);
  const chartTooltip = { background: "#171719", border: "1px solid #78613c", color: "#f3eee5", borderRadius: 10 };

  return <section className="general-comparison" aria-label="Comparación general de clústeres y tiendas">
    <header className="general-comparison__header"><div><span className="eyebrow">Vista nacional · {periodLabel}</span><h2>Clústeres y tiendas</h2><p>Las cifras usan el mismo período. La asistencia se calcula sobre marcas registradas. «Pendientes» son días laborables (lunes a sábado) del vínculo sin marca; no equivalen a faltas.</p></div><span className="general-comparison__scope">{clusters.length} clústeres · {totals.tiendas} tiendas activas</span></header>
    <div className="general-comparison__totals">
      <article><small>Visitas registradas</small><strong>{clusters.some(cluster => cluster.conteos_trafico) ? formatNumber(totals.visitas) : "Sin registros"}</strong><span>En {days} {days === 1 ? "día laborable" : "días laborables"}</span></article>
      <article><small>Asistencia sobre marcas</small><strong>{attendanceRate(totals)}</strong><span>{formatNumber(totals.asistentes)} de {formatNumber(totals.marcas)} marcas</span></article>
      <article><small>Faltas / pendientes</small><strong>{formatNumber(totals.faltas)} / {formatNumber(totals.pendientes)}</strong></article>
      <article><small>Incidencias / errores</small><strong>{formatNumber(totals.incidencias)} / {formatNumber(totals.errores)}</strong></article>
    </div>
    {clusters.length ? <>
      <div className="general-comparison__charts">
        <article className="panel"><header className="panel__header"><div><h3>Tráfico por clúster</h3><p>Visitas registradas en {periodLabel.toLowerCase()}. Sin barra cuando no hay conteos.</p></div></header><div style={{ height: chartHeight }}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows} layout="vertical" margin={{ left: 4, right: 24 }}><CartesianGrid stroke="#45413a" horizontal={false}/><XAxis type="number" allowDecimals={false} tick={{ fill: "#b5ad9f" }}/><YAxis type="category" dataKey="nombre" width={120} tick={{ fill: "#d9d0c1", fontSize: 12 }}/><Tooltip contentStyle={chartTooltip}/><Bar dataKey="visitas" name="Visitas registradas" isAnimationActive={false} fill="#cda85f" radius={[0, 4, 4, 0]}/></BarChart></ResponsiveContainer></div></article>
        <article className="panel"><header className="panel__header"><div><h3>Registro de asistencia por clúster</h3><p>Marcas del período y días del vínculo sin registrar. Cada unidad representa una persona por día.</p></div></header><div style={{ height: chartHeight }}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows} layout="vertical" margin={{ left: 4, right: 24 }}><CartesianGrid stroke="#45413a" horizontal={false}/><XAxis type="number" allowDecimals={false} tick={{ fill: "#b5ad9f" }}/><YAxis type="category" dataKey="nombre" width={120} tick={{ fill: "#d9d0c1", fontSize: 12 }}/><Tooltip contentStyle={chartTooltip}/><Legend wrapperStyle={{ fontSize: 11 }}/><Bar dataKey="asistencia_sin_tardanza" name="Asistencia / apoyo / medio turno" stackId="marks" isAnimationActive={false} fill="#2f9e78"/><Bar dataKey="tardanzas" name="Tardanza" stackId="marks" isAnimationActive={false} fill="#c9932f"/><Bar dataKey="faltas" name="Falta" stackId="marks" isAnimationActive={false} fill="#d9635f"/><Bar dataKey="otros" name="Permisos / descansos / suspensión" stackId="marks" isAnimationActive={false} fill="#8f7ac8"/><Bar dataKey="pendientes" name="Sin registro" stackId="marks" isAnimationActive={false} fill="#7f8a97"/></BarChart></ResponsiveContainer></div></article>
      </div>
      <div className="general-comparison__clusters" aria-label="Seleccionar clúster">
        <button type="button" className={!clusterId ? "active" : ""} onClick={() => setClusterId("")} aria-pressed={!clusterId}>Todos los clústeres</button>
        {clusters.map((cluster) => <button type="button" key={cluster.id} className={clusterId === String(cluster.id) ? "active" : ""} onClick={() => setClusterId(String(cluster.id))} aria-pressed={clusterId === String(cluster.id)}>{cluster.nombre}</button>)}
      </div>
      <div className="general-comparison__cards">{clusters.map((cluster) => <button type="button" className={`general-comparison__card ${clusterId === String(cluster.id) ? "selected" : ""}`} key={cluster.id} onClick={() => setClusterId(String(cluster.id))}>
        <span><strong>{cluster.nombre}</strong><small>{cluster.tiendas} {cluster.tiendas === 1 ? "tienda" : "tiendas"} · {cluster.personal} personas al cierre</small></span>
        <div className="general-comparison__bar" aria-hidden="true"><i style={{ width: `${cluster.visitas / largest * 100}%` }} /></div>
        <span className="general-comparison__card-stats"><b>{cluster.conteos_trafico ? `${formatNumber(cluster.visitas)} visitas` : "Sin conteos de tráfico"}</b><small>{cluster.conteos_trafico ? `${formatNumber(cluster.visitas / cluster.tiendas / days)} visitas por tienda/día` : "Promedio no disponible"}</small><small>{attendanceRate(cluster)} asistencia · {cluster.faltas} faltas · {cluster.pendientes} pendientes</small><small>{cluster.incidencias} incidencias · {cluster.errores} errores</small></span>
      </button>)}</div>
      <div className="general-comparison__stores"><header><div><h3>{selectedCluster ? `Tiendas de ${selectedCluster.nombre}` : "Comparación de todas las tiendas"}</h3><p>Ordenadas por visitas registradas · {periodLabel}</p></div><strong>{visibleStores.length} tiendas</strong></header>
        <div className="general-comparison__table-scroll"><table><thead><tr><th>Tienda</th><th>Clúster</th><th>Visitas</th><th>Por día</th><th>Asistencia / marcas</th><th>Faltas</th><th>Pendientes</th><th>Incidencias</th><th>Errores</th></tr></thead><tbody>{visibleStores.map((store) => <tr key={store.id}><th>{store.nombre}</th><td>{store.cluster_nombre}</td><td>{store.conteos_trafico ? formatNumber(store.visitas) : "Sin registros"}</td><td>{store.conteos_trafico ? formatNumber(store.visitas / days) : "—"}</td><td>{attendanceRate(store)} <small>({store.asistentes}/{store.marcas})</small></td><td>{store.faltas}</td><td>{store.pendientes}</td><td>{store.incidencias_administrativas + store.incidencias_seguridad}</td><td>{store.errores}</td></tr>)}</tbody></table></div>
      </div>
    </> : <p className="general-comparison__empty">No hay tiendas activas para comparar.</p>}
  </section>;
}
