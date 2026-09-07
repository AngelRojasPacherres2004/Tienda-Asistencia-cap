import { useEffect, useState } from "react";
import { Building2, Download, FileSpreadsheet } from "lucide-react";
import { api, downloadFile, todayISO } from "../lib/api";
import { EmptyState, Loading, Notice, PageHeader, SearchInput } from "../components/UI";

export default function Documentos() {
  const [tiendas, setTiendas] = useState(null);
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState("asistencias");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState(todayISO());
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    api("/tiendas").then(setTiendas).catch((err) => setNotice({ type: "error", text: err.message }));
  }, []);

  const rangeParams = () => {
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    return params.toString();
  };

  const downloadTienda = async (tienda) => {
    setBusyId(tienda.id); setNotice(null);
    try {
      const params = new URLSearchParams(rangeParams());
      params.set("tipo", tipo);
      await downloadFile(`/api/documentos/tiendas/${tienda.id}.xlsx?${params}`, `${tienda.nombre}-${tipo}.xlsx`);
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setBusyId(null);
    }
  };

  const downloadTodo = async () => {
    setBusyId("todo"); setNotice(null);
    try {
      const params = rangeParams();
      await downloadFile(`/api/documentos/todo.xlsx?tipo=${tipo}&${params}`, `todas-las-tiendas-${tipo}.xlsx`);
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setBusyId(null);
    }
  };

  const filtered = (tiendas || []).filter((t) => t.nombre.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <PageHeader
        eyebrow="Reportes"
        title="Documentos"
        subtitle="Descarga Excel de asistencias y capacitaciones por tienda."
        action={
          <div className="header-actions">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="asistencias">Asistencias</option>
              <option value="capacitaciones">Capacitaciones</option>
            </select>
            <button className="button button--primary" disabled={busyId === "todo"} onClick={downloadTodo}>
              <Download size={16} />{busyId === "todo" ? "Generando…" : "Descargar todo (por hojas)"}
            </button>
          </div>
        }
      />
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="toolbar toolbar--filters">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar tienda…" />
        <span>Desde</span>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <span>Hasta</span>
        <input type="date" value={hasta} max={todayISO()} onChange={(e) => setHasta(e.target.value)} />
      </div>

      {!tiendas ? <Loading /> : filtered.length ? (
        <div className="table-panel">
          <div className="data-table data-table--documentos">
            <div className="data-table__head"><span>Tienda</span><span>Estado</span><span /></div>
            {filtered.map((tienda) => (
              <div className="data-table__row" key={tienda.id}>
                <div className="person-cell">
                  <span className="avatar"><Building2 size={15} /></span>
                  <div><strong>{tienda.nombre}</strong><small>{tienda.direccion || "Sin dirección"}</small></div>
                </div>
                <span className={`status status--${tienda.estado}`}><i />{tienda.estado}</span>
                <div className="row-actions">
                  <button disabled={busyId === tienda.id} onClick={() => downloadTienda(tienda)} aria-label="Descargar Excel">
                    <FileSpreadsheet size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState icon={FileSpreadsheet} title="Sin tiendas" text="Crea una tienda para poder generar sus reportes." />
      )}
    </>
  );
}
