import React from "react";
import CommercialReactChart from "./CommercialReactChart";

const ignoreClick = () => {};

export default function CommercialReactReplenishmentCard({ model, onAction }) {
  return <article className={`card predictive-v2-card predictive-action-card predictive-replenishment-card${model.expanded ? " chart-expanded" : ""}`} aria-busy={model.loading || undefined} data-react-commercial-module="replenishment-card">
    {model.loading && <div className="predictive-card-refresh" role="status">Actualizando reposición…</div>}
    <button type="button" className="chart-expand" onClick={() => onAction({ type: "expand" })} aria-label={model.expanded ? "Cerrar gráfico" : "Ampliar gráfico y ver detalle"}>{model.expanded ? "×" : "⛶"}</button>
    <div className="title-row"><span className="card-letter">B</span><h2><svg><use href="/comercial/assets/icons.svg#reorder" /></svg> PRIORIDAD DE REPOSICIÓN POR MARCA</h2></div>
    <div className="predictive-chart-content"><dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId="predictive-replenishment" label="Prioridad de reposición por marca" option={model.option} onClick={ignoreClick} /></div></dashboard-chart>
      {model.expanded && <div className="predictive-detail-table" aria-label="Detalle de prioridad de reposición por marca"><div className="predictive-detail-head replenishment-head"><span>MARCA</span><span>PRIORIDAD</span><span>REPOSICIÓN</span><span>COBERTURA</span><span>STOCK VENDIBLE</span></div><div className="predictive-detail-body replenishment-body">{model.rows.length ? model.rows.map(row => <div key={row.name}><strong>{row.name}</strong><span className="status-cell"><i style={{ backgroundColor: row.color }} />{row.priority}</span><span>{row.deficitUnits}</span><span>{row.coverage}</span><span>{row.vendibleUnits}</span></div>) : <p>N/A</p>}</div></div>}
    </div>
  </article>;
}
