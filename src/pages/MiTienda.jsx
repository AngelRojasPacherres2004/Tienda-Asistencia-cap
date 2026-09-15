import { useEffect, useState } from "react";
import { Building2, CalendarCheck2, FileText, MapPin, Users } from "lucide-react";
import { api, formatDate } from "../lib/api";
import { Loading, Notice, PageHeader, StatusBadge } from "../components/UI";
import DocumentosLegales from "./DocumentosLegales";

export default function MiTienda({ user, onNavigate }) {
  const [tab, setTab] = useState("resumen");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api("/mi-tienda").then(setData).catch((err) => setError(err.message)); }, []);

  if (user.rol_db !== "administrador_tienda") return <Notice type="error">No tienes permisos para acceder a esta sección.</Notice>;
  return <>
    <PageHeader eyebrow="Mi tienda" title={data?.nombre || "Mi tienda"} subtitle="Gestión general y documental de tu tienda." action={<button className="button button--ghost" onClick={() => window.print()}>Exportar resumen</button>} />
    <div className="section-tabs"><button className={tab === "resumen" ? "active" : ""} onClick={() => setTab("resumen")}>Resumen</button><button className={tab === "documentos" ? "active" : ""} onClick={() => setTab("documentos")}>Documentos</button></div>
    {error && <Notice type="error">{error}</Notice>}
    {!data ? <Loading label="Cargando la tienda…" /> : tab === "documentos" ? <DocumentosLegales user={user} embedded /> : <div className="store-overview-grid">
      <section className="panel store-main-card"><header className="panel__header"><div><h2>Datos principales</h2><p>Información registrada de la tienda</p></div><Building2 /></header><dl className="store-data-list"><div><dt>Nombre</dt><dd>{data.nombre}</dd></div><div><dt>Estado operativo</dt><dd><StatusBadge value={data.estado} /></dd></div><div className="span-2"><dt>Dirección</dt><dd>{data.direccion || "Sin registrar"}</dd></div><div><dt>Fecha de apertura</dt><dd>{formatDate(data.fecha_creacion)}</dd></div><div><dt>Jefe zonal</dt><dd>{data.zonal_nombre || "Sin asignar"}</dd></div></dl></section>
      <div className="store-side-stack"><section className="panel"><header className="panel__header"><div><h2>Estado documental</h2><p>Documentos legales de la tienda</p></div><FileText /></header><div className="store-document-stats"><div><span>Vigentes</span><strong>{data.documentos.vigentes}</strong></div><div><span>Por vencer</span><strong>{data.documentos.por_vencer}</strong></div><div><span>Vencidos</span><strong>{data.documentos.vencidos}</strong></div></div></section>
      <section className="panel"><header className="panel__header"><div><h2>Accesos rápidos</h2><p>Operaciones frecuentes</p></div></header><div className="quick-links"><button onClick={() => setTab("documentos")}><FileText />Ver documentos</button><button onClick={() => onNavigate("usuarios")}><Users />Gestionar personal</button><button onClick={() => onNavigate("asistencias")}><CalendarCheck2 />Registrar asistencia</button><button onClick={() => onNavigate("incidentes")}><MapPin />Registrar incidencia</button></div></section></div>
    </div>}
  </>;
}
