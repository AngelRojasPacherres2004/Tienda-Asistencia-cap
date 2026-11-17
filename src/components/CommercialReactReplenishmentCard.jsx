import React from "react";
export default function CommercialReactReplenishmentCard({ model }) {
  return <article className="card predictive-v2-card predictive-replenishment-card replenishment-matrix-card" aria-busy={model.loading || undefined} data-react-commercial-module="replenishment-card">
    {model.loading && <div className="predictive-card-refresh" role="status">Actualizando reposición…</div>}
    <div className="title-row"><span className="card-letter">B</span><h2><svg><use href="/comercial/assets/icons.svg#reorder" /></svg> PRIORIDAD DE REPOSICIÓN POR MARCA</h2></div>
    <div className="replenishment-matrix" aria-label="Detalle de prioridad de reposición por marca">
      <div className="replenishment-matrix-head"><span>MARCA</span><span>PRIORIDAD</span><span>REPOSICIÓN</span><span>COBERTURA</span><span>STOCK VENDIBLE</span></div>
      <div className="replenishment-matrix-body">{model.rows.length ? model.rows.map(row => <div key={row.name}><strong title={row.name}>{row.name}</strong><span className="status-cell"><i style={{ backgroundColor: row.color }} />{row.priority}</span><span>{row.deficitUnits}</span><span>{row.coverage}</span><span>{row.vendibleUnits}</span></div>) : <p>N/A</p>}</div>
    </div>
  </article>;
}
