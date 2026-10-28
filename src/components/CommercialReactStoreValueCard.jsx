import React from "react";
import CommercialReactChart from "./CommercialReactChart";
import CommercialReactStockMatrix from "./CommercialReactStockMatrix";

const ignoreClick = () => {};

export default function CommercialReactStoreValueCard({ model, onAction }) {
  return <article className={`card chart-card store-value-coverage-card${model.expanded ? " chart-expanded" : ""}`} data-react-commercial-module="store-value-card">
    <button type="button" className="chart-expand" onClick={() => onAction({ type: "expand" })} aria-label={model.expanded ? "Cerrar gráfico" : "Ampliar gráfico"}>{model.expanded ? "×" : "⛶"}</button>
    <div className="inventory-chart-heading"><h2><svg><use href="/comercial/assets/icons.svg#warehouse" /></svg> VALOR DE INVENTARIO POR TIENDA</h2></div>
    <div className="store-value-coverage-content">
      {!model.ready ? <div className="card-inline-loader" role="status"><span className="loader" />Preparando cobertura por tienda…</div> : <>
        <div className="store-value-chart-pane">
          <dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId="inventory-store-value" label="Valor de inventario por tienda, coloreado según estado de cobertura" onClick={ignoreClick} option={model.option} /></div></dashboard-chart>
          <div className="inventory-health-strip">{model.health.map(item => <span key={item.label} className={item.tone}><i />{item.label}<strong>{item.count}</strong></span>)}</div>
        </div>
        {model.expanded && <CommercialReactStockMatrix model={model.matrix} />}
      </>}
    </div>
  </article>;
}
