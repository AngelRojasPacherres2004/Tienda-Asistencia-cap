import { useEffect, useMemo, useState } from "react";
import { DatabaseZap, Search } from "lucide-react";
import { api } from "../lib/api";
import { EmptyState, Loading, Notice, PageHeader, StatusBadge } from "../components/UI";

const tabs = [
  { value: "marca", label: "Marcas" },
  { value: "lote", label: "Lotes" },
  { value: "guia", label: "Guías" },
  { value: "rms", label: "Validación RMS" },
];

const tipoLabels = { marca: "Marca", lote: "Lote", guia: "Guía", rms: "Validación RMS" };

export default function Consultas({ user }) {
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState("marca");
  const [search, setSearch] = useState("");
  const [rubro, setRubro] = useState("todos");
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    api("/consultas").then(setItems).catch((error) => setNotice({ type: "error", text: error.message }));
  }, []);

  const rubros = useMemo(() => [...new Set((items || []).map((item) => item.rubro).filter(Boolean))].sort(), [items]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (items || []).filter((item) => item.tipo === tab
      && (rubro === "todos" || item.rubro === rubro)
      && (!term || [item.codigo, item.descripcion, item.rubro, item.estado, item.fuente].some((value) => String(value || "").toLowerCase().includes(term))));
  }, [items, tab, search, rubro]);

  if (user.rol_db !== "administrador_tienda") return <Notice type="error">No tienes permisos para acceder a esta sección.</Notice>;

  return (
    <>
      <PageHeader eyebrow="Consultas" title="Marcas · Lotes · Guías · Validación RMS" subtitle="Información de consulta; esta sección no permite crear, editar ni eliminar registros." />
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      <nav className="query-tabs" aria-label="Tipos de consulta">
        {tabs.map((item) => <button key={item.value} className={tab === item.value ? "active" : ""} onClick={() => setTab(item.value)}>[ {item.label} ]</button>)}
      </nav>
      <div className="query-filters">
        <label><span>Buscar</span><div className="query-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Código, marca, lote o guía" /></div></label>
        <label><span>Rubro</span><select value={rubro} onChange={(event) => setRubro(event.target.value)}><option value="todos">Todos</option>{rubros.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      {!items ? <Loading label="Cargando consultas…" /> : filtered.length ? <div className="table-panel query-panel">
        <div className="data-table data-table--queries">
          <div className="data-table__head"><span>Tipo</span><span>Código</span><span>Descripción</span><span>Rubro</span><span>Estado</span><span>Fuente</span></div>
          {filtered.map((item) => <div className="data-table__row" key={item.id}>
            <span>{tipoLabels[item.tipo]}</span><span className="mono">{item.codigo}</span><strong className="cell-primary">{item.descripcion}</strong><span>{item.rubro || "—"}</span><StatusBadge value={item.estado} /><span>{item.fuente}</span>
          </div>)}
        </div>
      </div> : <EmptyState icon={DatabaseZap} title={`Sin ${tipoLabels[tab]?.toLowerCase() || "resultados"}`} text="No hay registros que coincidan con los filtros seleccionados." />}
      <section className="rms-info-panel">
        <strong>Validación RMS</strong>
        <p>Compara los datos importados y señala diferencias. La plataforma no modifica RMS ni reemplaza el inventario maestro.</p>
      </section>
    </>
  );
}
