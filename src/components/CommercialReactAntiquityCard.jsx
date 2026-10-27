import React from "react";
import CommercialReactChart from "./CommercialReactChart";

export default function CommercialReactAntiquityCard({ model, onAction }) {
  return <article className={`card chart-card antiquity-card${model.expanded ? " chart-expanded" : ""}`} data-stock-origin-ready={model.ready ? "true" : undefined} data-react-commercial-module="antiquity-card">
    <button type="button" className="chart-expand" onClick={() => onAction({ type: "expand" })} aria-label={model.expanded ? "Cerrar gráfico" : "Ampliar gráfico"}>{model.expanded ? "×" : "⛶"}</button>
    <h2><svg><use href="/comercial/assets/icons.svg#calendar" /></svg> ANTIGÜEDAD STOCK · {model.label}</h2>
    {model.detailLoading && <div className="card-inline-loader"><span className="loader" />Preparando antigüedad…</div>}
    <div className="stock-year-tabs" aria-label="Años de origen del stock; se pueden seleccionar varios">{model.buckets.map(bucket => <button key={bucket.value} type="button" className={bucket.active ? "active" : undefined} aria-pressed={bucket.active} title={bucket.title} onClick={() => onAction({ type: "bucket", value: bucket.value })}>{bucket.label}</button>)}</div>
    <dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId="inventory-antiquity" label="Unidades de stock por mes de origen; haz clic en una barra para ver su ubicación por tienda" option={model.option} onClick={value => onAction({ type: "detail", value: value?.period })} /></div></dashboard-chart>
    <div className="stock-history-summary"><div title="Fórmula: Σ(unidades de stock) de los años de origen seleccionados."><small>UNIDADES</small><strong>{model.summary.units}</strong></div><div title="Fórmula: Σ(valor de stock) de los años de origen seleccionados."><small>VALOR STOCK</small><strong>{model.summary.value}</strong></div><div title="Fórmula: unidades de los años seleccionados ÷ unidades de stock de todos los años × 100."><small>% DEL STOCK</small><strong>{model.summary.share}</strong></div></div>
  </article>;
}
