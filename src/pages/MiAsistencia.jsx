import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2 } from "lucide-react";
import { api, estadoAsistenciaLabels, formatDate, todayISO } from "../lib/api";
import { EmptyState, Loading, Notice, PageHeader, StatusBadge } from "../components/UI";

export default function MiAsistencia() {
  const [desde, setDesde] = useState(`${todayISO().slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(todayISO());
  const [items, setItems] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    api(`/mis-asistencias?desde=${desde}&hasta=${hasta}`).then(setItems).catch((err) => setNotice({ type: "error", text: err.message }));
  }, [desde, hasta]);

  const resumen = useMemo(() => {
    if (!items) return null;
    const total = items.length;
    const presentes = items.filter((row) => row.estado === "presente").length;
    return { total, presentes, tasa: total ? Math.round((presentes / total) * 100) : 0 };
  }, [items]);

  return (
    <>
      <PageHeader eyebrow="Mi historial" title="Mi asistencia" subtitle="Consulta tus registros de asistencia por fecha." />
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      {resumen && (
        <section className="compact-metrics">
          <div><span>Días registrados</span><strong>{resumen.total}</strong></div>
          <div className="green"><span>Presentes</span><strong>{resumen.presentes}</strong></div>
          <div className="amber"><span>Tasa de asistencia</span><strong>{resumen.tasa}%</strong></div>
        </section>
      )}

      <div className="toolbar toolbar--filters">
        <span>Desde</span>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <span>Hasta</span>
        <input type="date" value={hasta} max={todayISO()} onChange={(e) => setHasta(e.target.value)} />
      </div>

      {!items ? <Loading /> : items.length ? (
        <div className="table-panel">
          <div className="data-table data-table--mi-asistencia">
            <div className="data-table__head"><span>Fecha</span><span>Estado</span><span>Observaciones</span></div>
            {items.map((row) => (
              <div className="data-table__row" key={row.id}>
                <span>{formatDate(row.fecha)}</span>
                <span><StatusBadge value={row.estado} label={estadoAsistenciaLabels[row.estado]} /></span>
                <span>{row.observaciones || "—"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState icon={CalendarCheck2} title="Sin registros" text="No tienes asistencias registradas en ese rango de fechas." />
      )}
    </>
  );
}
