import React from "react";
import CommercialReactChart from "./CommercialReactChart";
import CommercialChartZoomFilters from "./CommercialChartZoomFilters";

const ignoreClick = () => {};

export default function CommercialReactPriceRangeCard({ model, onAction }) {
  return <article className={`card chart-card price-range-card${model.expanded ? " chart-expanded" : ""}`} data-react-commercial-module="price-range-card">
    <button type="button" className="chart-expand" onClick={() => onAction({ type: "expand" })} aria-label={model.expanded ? "Cerrar gráfico" : "Ampliar gráfico y ver detalle"}>{model.expanded ? "×" : "⛶"}</button>
    <div className="price-range-header"><h2><svg><use href="/comercial/assets/icons.svg#comparison" /></svg> RANGO DE PRECIOS VENDIDOS{model.periodLabel && <span className="chart-title-period"> · {model.periodLabel}</span>}</h2></div>
    {model.expanded && <CommercialChartZoomFilters filters={model.filters} keys={["category", "gender", "line", "subline", "brand"]} onAction={onAction} />}
    <div className="price-range-chart-content">{model.ready ? <dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId="price-range" label="Venta y unidades por rango de precios vendidos y año" option={model.option} onClick={ignoreClick} /></div></dashboard-chart> : <div className="card-inline-loader" role="status"><span className="loader" />Cargando rangos de precio…</div>}
      {model.expanded && (model.ready
        ? <div className="price-range-detail-table" aria-label="Detalle por rango de precios del año seleccionado"><div className="price-range-detail-head"><span>RANGO</span><span>VENTA NETA</span><span>UNIDADES</span><span>PRECIO PROM.</span><span>VAR. VS {model.comparisonYear}</span></div><div className="price-range-detail-body">{model.rows.length ? model.rows.map(row => <div key={row.label} className="base-year"><strong>{row.label}</strong><span>{row.net}</span><span>{row.units}</span><span>{row.averagePrice}</span><span className={row.variationPositive ? "variation-positive" : row.variationNegative ? "variation-negative" : ""}>{row.variation}</span></div>) : <p>N/A</p>}</div></div>
        : <div className="card-inline-loader price-range-detail-loader" role="status"><span className="loader" />Cargando rangos de precio…</div>)}
    </div>
  </article>;
}
