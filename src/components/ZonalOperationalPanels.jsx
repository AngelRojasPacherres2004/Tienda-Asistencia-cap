import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, todayISO } from "../lib/api";
import { Loading, Notice } from "./UI";
import { comparisonMonthRanges, mergeOperationalComparisons } from "../../shared/operational-comparison.js";

export default function ZonalOperationalPanels({ ranges, storeIds, showAttendance }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const key = JSON.stringify({ ranges, storeIds });
  useEffect(() => {
    let active = true;
    setData(null); setError("");
    const scope = JSON.parse(key);
    const monthRanges = comparisonMonthRanges(scope.ranges, todayISO());
    Promise.all(monthRanges.map(range => api(`/zonal/comparativa?${new URLSearchParams(range)}`)))
      .then(results => {
        if (active) setData(mergeOperationalComparisons(results, scope.storeIds));
      }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [key]);
  if (error) return <Notice type="error">{error}</Notice>;
  if (data === null) return <Loading />;
  const rows = data;
  const chartHeight = Math.max(240, rows.length * 34 + 40);
  if (!rows.length) return <p>No hay tiendas para mostrar con estos filtros.</p>;
  return <div className="zonal-comparison">
    <div className="zonal-comparison-charts">{showAttendance && <article><header><h3>Asistencia por tienda</h3></header><div className="zonal-comparison-chart-scroll"><div className="zonal-comparison-chart" style={{ height: chartHeight }}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={rows} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e0e8f0" /><XAxis type="number" allowDecimals={false} tick={{ fill: "#52667c", fontSize: 10 }} /><YAxis type="category" dataKey="nombre" width={108} tick={{ fill: "#173b60", fontSize: 10, fontWeight: 700 }} /><Tooltip /><Legend /><Bar dataKey="presentes" name="Presentes" stackId="asistencia" fill="#16a66a" /><Bar dataKey="tardanzas" name="Tardanzas" stackId="asistencia" fill="#f0ad32" /><Bar dataKey="faltas" name="Faltas" stackId="asistencia" fill="#e36a70" /><Bar dataKey="pendientes" name="Pendientes" stackId="asistencia" fill="#a7b6c6" /></BarChart></ResponsiveContainer></div></div></article>}</div>
    <section className="zonal-comparison-table-card"><header><h3>Pulso operativo por tienda</h3></header><div className="zonal-comparison-table-scroll"><table><thead><tr><th>Tienda</th><th title="Colaboradores frente a la dotación planificada para el período">Dotación / meta</th><th>Brecha</th><th>Tráfico / persona</th><th>Novedades de asistencia</th><th>Alertas</th></tr></thead><tbody>{rows.map((row) => { const attendanceIssues=row.faltas+row.tardanzas+row.pendientes; const alerts=row.incidencias_administrativas+row.incidencias_seguridad+row.errores+row.documentos_por_vencer; return <tr key={row.id}><th>{row.nombre}</th><td title={row.meta_campana ? "Meta de campaña" : "Meta base"}>{row.personal}{row.meta_personal === null ? " / —" : ` / ${row.meta_personal}`}</td><td className={row.brecha_personal < 0 ? "is-short" : ""}>{row.brecha_personal === null ? "—" : row.brecha_personal < 0 ? `Faltan ${-row.brecha_personal}` : row.brecha_personal ? `+${row.brecha_personal}` : "Completa"}</td><td>{row.visitas&&row.personal ? (row.visitas/row.personal).toLocaleString("es-PE", { maximumFractionDigits: 1 }) : "—"}</td><td title="Faltas, tardanzas y marcas pendientes">{attendanceIssues || "—"}</td><td title={`${row.incidencias_administrativas+row.incidencias_seguridad} incidencias · ${row.errores} errores · ${row.documentos_por_vencer} documentos por vencer`}>{alerts || "—"}</td></tr>; })}</tbody></table></div></section>
  </div>;
}
