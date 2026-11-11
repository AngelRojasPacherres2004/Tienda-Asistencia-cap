import { Eye } from "lucide-react";
import { StatusBadge } from "./UI";
import { OPERATIONAL_ROLE_LABELS } from "../../shared/roleCatalog.js";

export default function StorePersonnelReportTable({ rows, onView }) {
  return <div className="table-panel">
    <div className="data-table data-table--usuarios-tienda data-table--commercial-personnel" aria-label="Personal por tienda">
      <div className="data-table__head"><span>Nombre</span><span>DNI</span><span>Distrito</span><span>Teléfono</span><span>Rol</span><span>Tienda</span><span>Estado</span><span>Detalle</span></div>
      {rows.map(row => <div className="data-table__row" key={row.id}>
        <div className="person-cell"><div><button type="button" className="person-link" onClick={() => onView(row)}>{row.nombre}</button></div></div>
        <span className="mono">{row.dni || "—"}</span>
        <span className="cell-primary">{row.distrito || "—"}</span>
        <span>{row.telefono || "—"}</span>
        <span className="personnel-role">{OPERATIONAL_ROLE_LABELS[row.rol_codigo] || row.rol || "—"}</span>
        <span>{row.tienda || "Sin asignar"}</span>
        <span><StatusBadge value={row.estado}/></span>
        <div className="row-actions"><button type="button" onClick={() => onView(row)} title="Ver ficha" aria-label={`Ver ficha de ${row.nombre}`}><Eye size={15}/></button></div>
      </div>)}
    </div>
  </div>;
}
