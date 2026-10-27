import React from "react";
import CommercialReactChart from "./CommercialReactChart";

const ignoreClick = () => {};

export default function CommercialReactPriceRangeCard({ model, onAction }) {
  return <article className={`card chart-card price-range-card${model.expanded ? " chart-expanded" : ""}`} data-react-commercial-module="price-range-card">
    <button type="button" className="chart-expand" onClick={() => onAction({ type: "expand" })} aria-label={model.expanded ? "Cerrar gráfico" : "Ampliar gráfico y ver detalle"}>{model.expanded ? "×" : "⛶"}</button>
    <div className="price-range-header"><h2><svg><use href="/comercial/assets/icons.svg#comparison" /></svg> RANGO DE PRECIOS VENDIDOS</h2><div className="price-range-years"><span>Año base <strong>{model.year}</strong></span>{model.years.length > 0 && <label>Comparar con<select value={model.comparisonYear} onChange={event => onAction({ type: "year", value: Number(event.target.value) })}>{model.years.map(year => <option key={year} value={year}>{year}</option>)}</select></label>}</div></div>
    <div className="price-range-chart-content">{model.ready ? <dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId="price-range" label="Venta y unidades por rango de precios vendidos y año" option={model.option} onClick={ignoreClick} /></div></dashboard-chart> : <div className="card-inline-loader" role="status"><span className="loader" />Cargando rangos de precio…</div>}
      {model.expanded && <div className="price-range-detail-table" aria-label="Detalle por rango de precios y año"><div className="price-range-detail-head"><span>RANGO / AÑO</span><span>VENTA NETA</span><span>PARTICIPACIÓN</span><span>UNIDADES</span><span>PRECIO PROM.</span></div><div className="price-range-detail-body">{model.rows.length ? model.rows.map(row => <div key={`${row.year}-${row.label}`} className={row.year === model.year ? "base-year" : undefined}><strong>{row.label}<small>{row.year}</small></strong><span>{row.net}</span><span>{row.share}</span><span>{row.units}</span><span>{row.averagePrice}</span></div>) : <p>N/A</p>}</div></div>}
    </div>
  </article>;
}
