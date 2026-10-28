import React from "react";
import CommercialReactChart from "./CommercialReactChart";

const ignoreClick = () => {};

export default function CommercialReactBrandCard({ model, onAction }) {
  return <article className={`card chart-card brand-sales-card${model.expanded ? " chart-expanded" : ""}`} data-react-commercial-module="brand-card">
    <button type="button" className="chart-expand" onClick={() => onAction({ type: "expand" })} aria-label={model.expanded ? "Cerrar gráfico" : "Ampliar gráfico"}>{model.expanded ? "×" : "⛶"}</button>
    <h2><svg><use href="/comercial/assets/icons.svg#brand" /></svg> VENTA POR MARCA</h2>
    <div className="brand-chart-content">
      <dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId="brand-sales" label="Venta por marca" onClick={ignoreClick} option={model.option} /></div></dashboard-chart>
      {model.expanded && <div className="brand-detail-table" aria-label="Detalle de venta por marca"><div className="brand-detail-head"><span>MARCA</span><span>VENTA NETA</span><span>PARTICIPACIÓN</span><span>UNIDADES</span></div><div className="brand-detail-body">{model.rows.length ? model.rows.map(row => <div key={row.name}><strong>{row.name}</strong><span>{row.net}</span><span>{row.share}</span><span>{row.units}</span></div>) : <p>N/A</p>}</div></div>}
    </div>
  </article>;
}
