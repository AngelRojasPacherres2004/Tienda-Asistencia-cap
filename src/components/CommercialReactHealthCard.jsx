import React from "react";
import CommercialReactChart from "./CommercialReactChart";

const ignoreClick = () => {};

export default function CommercialReactHealthCard({ model }) {
  return <article className="card predictive-v2-card health-card" data-react-commercial-module="health-card">
    <div className="title-row"><span className="card-letter">A</span><h2><svg><use href="/comercial/assets/icons.svg#category" /></svg> SALUD DEL INVENTARIO</h2></div>
    <div className="health-card-content"><dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId="predictive-health" label="Círculo de salud del inventario; pasa el mouse por cada color para ver el detalle" option={model.option} onClick={ignoreClick} /></div></dashboard-chart><div className="health-table"><div className="health-table-head"><span>ESTADO</span><span>VALOR STOCK</span><span>PARTIC.</span></div>{model.rows.map(row => <div key={row.status}><strong><i style={{ backgroundColor: row.color }} />{row.status}</strong><span>{row.value}</span><span>{row.share}</span></div>)}</div></div>
  </article>;
}
