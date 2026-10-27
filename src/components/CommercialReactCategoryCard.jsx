import React from "react";
import CommercialReactChart from "./CommercialReactChart";

const ignoreClick = () => {};

export default function CommercialReactCategoryCard({ model, onAction }) {
  const emit = (type, value) => onAction({ type, value });
  return <article className={`card chart-card category-card${model.expanded ? " chart-expanded" : ""}`} data-react-commercial-module="category-card">
    <button type="button" className="chart-expand" onClick={() => emit("expand")} aria-label={model.expanded ? "Cerrar gráfico" : "Ampliar gráfico"}>{model.expanded ? "×" : "⛶"}</button>
    <div className="category-title"><h2><svg><use href="/comercial/assets/icons.svg#category" /></svg> PARTICIPACIÓN POR {model.view === "LINEA" ? "CATEGORÍA" : "RUBRO"}</h2><div className="category-view-toggle"><button type="button" className={model.view === "RUBRO" ? "active" : undefined} onClick={() => emit("view", "RUBRO")}>RUBRO</button><button type="button" className={model.view === "LINEA" ? "active" : undefined} onClick={() => emit("view", "LINEA")}>CATEGORÍA</button></div></div>
    <div className="category-chart-content"><dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId="category-participation" label="Participación comercial por rubro o categoría" onClick={ignoreClick} option={model.option} /></div></dashboard-chart>
      {model.expanded && <div className="category-detail-table" aria-label="Detalle de participación"><div className="category-detail-head"><span>{model.view === "LINEA" ? "ÁREA" : "RUBRO"}</span><span>VENTA NETA</span><span>PARTICIPACIÓN</span><span>UNIDADES</span><span>LÍNEA CON MAYOR PARTIC.</span><span>COLOR</span></div><div className="category-detail-body">{model.rows.length ? model.rows.map(row => <div key={row.name}><strong>{row.name}</strong><span>{row.net}</span><span>{row.share}</span><span>{row.units}</span><span>{row.topLine}</span><i style={{ backgroundColor: row.color }} aria-label={`Color ${row.color}`} /></div>) : <p>N/A</p>}</div></div>}
    </div>
  </article>;
}
