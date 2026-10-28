import React from "react";
import CommercialReactChart from "./CommercialReactChart";

const ignoreClick = () => {};
const horizons = [[0, "ACTUAL"], [30, "+30D"], [60, "+60D"], [90, "+90D"]];

export default function CommercialReactProjectionCard({ model, onAction }) {
  return <article className="card predictive-v2-card predictive-action-card predictive-projection-card" data-react-commercial-module="projection-card">
    <div className="title-row"><span className="card-letter">C</span><h2><svg><use href="/comercial/assets/icons.svg#alert" /></svg> VALOR EN RIESGO POR TIENDA · 30 / 60 / 90</h2></div>
    <div className="projection-horizon-toggle">{horizons.map(([value, label]) => <button key={value} type="button" className={model.horizon === value ? "active" : undefined} onClick={() => onAction({ type: "horizon", value })}>{label}</button>)}</div>
    <dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId="predictive-projection" label="Valor de inventario en riesgo por tienda según horizonte" option={model.option} onClick={ignoreClick} /></div></dashboard-chart>
    <div className="projection-health-summary">{model.rows.map(row => <span key={row.status} title={`${row.status}: ${row.value}`}><i style={{ backgroundColor: row.color }} /><strong>{row.status}</strong><b>{row.share}</b><em>{row.products} SKU</em></span>)}</div>
    <div className="projection-priority-products"><small>PRODUCTOS A REVISAR · {model.horizon ? `+${model.horizon}D` : "ACTUAL"}</small><div>{model.products.length ? model.products.map(row => <span key={`${row.storeId}-${row.product}`} title={`${row.product} · ${row.store} · ${row.coverageDays == null ? "sin movimiento" : row.coverage}`}><i style={{ backgroundColor: row.color }} />{row.product} · {row.store}</span>) : <span>N/A</span>}</div></div>
  </article>;
}
