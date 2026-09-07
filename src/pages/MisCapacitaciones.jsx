import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { api, formatDate } from "../lib/api";
import { EmptyState, Loading, Notice, PageHeader, StatusBadge } from "../components/UI";

const progresoLabels = { pendiente: "Pendiente", en_curso: "En curso", completado: "Completado" };

export default function MisCapacitaciones() {
  const [items, setItems] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    api("/mis-capacitaciones").then(setItems).catch((err) => setNotice({ type: "error", text: err.message }));
  }, []);

  return (
    <>
      <PageHeader eyebrow="Mi desarrollo" title="Mis capacitaciones" subtitle="Tu progreso en cada curso del catálogo." />
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      {!items ? <Loading /> : items.length ? (
        <div className="cards-list">
          {items.map((item) => (
            <article className="task-catalog-card" key={item.curso_id}>
              <span className="catalog-icon"><GraduationCap size={18} /></span>
              <div>
                <strong>{item.titulo}</strong>
                <span>
                  {item.competencia}
                  {item.duracion_horas ? ` · ${item.duracion_horas} h` : ""}
                  {item.encargado_nombre ? ` · ${item.encargado_nombre}` : ""}
                </span>
              </div>
              <StatusBadge value={item.estado} label={progresoLabels[item.estado]} />
              <small>{item.fecha_finalizacion ? formatDate(item.fecha_finalizacion) : "—"}</small>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={GraduationCap} title="Sin cursos" text="Todavía no hay cursos disponibles en el catálogo." />
      )}
    </>
  );
}
