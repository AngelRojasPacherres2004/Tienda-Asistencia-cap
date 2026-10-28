import React from "react";
import CommercialReactChart from "./CommercialReactChart";

const ignoreClick = () => {};

export default function CommercialReactSellerCard({ model, onAction }) {
  return <article className={`card talent-card seller-performance-card${model.expanded ? " chart-expanded" : ""}`} data-seller-detail-ready={model.ready ? "true" : undefined} data-react-commercial-module="seller-card">
    <button type="button" className="seller-more-btn" onClick={() => onAction({ type: "expand" })} aria-label={model.expanded ? "Cerrar tabla de vendedores" : "Ampliar ranking de vendedores"}>{model.expanded ? "×" : "⛶"}</button>
    <h2><svg><use href="/comercial/assets/icons.svg#ranking" /></svg> RANKING DE VENTAS POR VENDEDOR</h2>
    <div className="seller-ranking-content">{model.loading ? <p className="detail-loading">CARGANDO VENDEDORES…</p> : <dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId="talent-seller-performance" label="Primeros 30 vendedores con desplazamiento vertical" option={model.option} onClick={ignoreClick} /></div></dashboard-chart>}
      {model.expanded && <div className="seller-ranking-table" aria-label="Todos los vendedores"><div className="seller-ranking-head"><span>VENDEDOR</span><span>VENTA NETA</span><span>UNIDADES</span><span>TRANSACCIONES</span></div><div className="seller-ranking-body">{model.rows.length ? model.rows.map(row => <div key={row.seller}><strong>{row.seller}</strong><span>{row.net}</span><span>{row.units}</span><span>{row.transactions}</span></div>) : <p>N/A</p>}</div></div>}
    </div>
  </article>;
}
