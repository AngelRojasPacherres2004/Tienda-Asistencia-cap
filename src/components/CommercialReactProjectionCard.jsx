import React from "react";
import CommercialReactChart from "./CommercialReactChart";

const ignoreClick = () => {};
const horizons = [[0, "ACTUAL"], [30, "+30D"], [60, "+60D"], [90, "+90D"]];

export default function CommercialReactProjectionCard({ model, onAction, storeView = false }) {
  return <article className={`card predictive-v2-card predictive-action-card predictive-projection-card${storeView ? ' predictive-projection-card--detail' : ''}`} aria-busy={model.loading || undefined} data-react-commercial-module="projection-card">
    {model.loading && <div className="predictive-card-refresh" role="status">Actualizando riesgo…</div>}
    <div className="title-row"><span className="card-letter">C</span><h2><svg><use href="/comercial/assets/icons.svg#alert" /></svg> VALOR EN RIESGO POR TIENDA · 30 / 60 / 90</h2></div>
    <div className="projection-horizon-toggle">{horizons.map(([value, label]) => <button key={value} type="button" className={model.horizon === value ? "active" : undefined} onClick={() => onAction({ type: "horizon", value })}>{label}</button>)}</div>
    {storeView ? <div className="risk-explainer">
      <p className="risk-explainer-period">{model.horizon ? `Proyección a ${model.horizon} días` : 'Situación actual'} · Riesgo por cobertura de inventario</p>
      {model.stores?.length ? model.stores.map(row => {
        const width = row.totalValue > 0 ? Math.min(100, Math.max(0, row.riskValue / row.totalValue * 100)) : 0;
        return <section className="risk-store-detail" key={row.storeId}>
          <header><h3>{row.store}</h3><strong>{row.riskShare} del valor evaluado en riesgo</strong></header>
          <div className="risk-share-bar" role="img" aria-label={`${row.store}: ${row.riskAmount} en riesgo de ${row.totalAmount} evaluados; ${row.riskShare}`}><span style={{ width: `${width}%` }} /><span style={{ width: `${100 - width}%` }} /></div>
          <div className="risk-share-legend"><span><i />En riesgo</span><span><i />Resto del valor evaluado</span></div>
          <dl className="risk-value-grid"><div><dt>Valor en riesgo</dt><dd>{row.riskAmount}</dd></div><div><dt>Resto del valor evaluado</dt><dd>{row.remainingAmount}</dd></div><div><dt>Total vendible evaluado</dt><dd>{row.totalAmount}</dd></div><div><dt>Productos en riesgo / evaluados</dt><dd>{row.riskProducts} / {row.products} <small>SKU</small></dd></div></dl>
        </section>;
      }) : <p className="risk-empty">No hay datos evaluados para estos filtros.</p>}
      <p className="risk-definition">En riesgo: productos en estado Crítico o Alerta. Porcentaje = valor en riesgo ÷ valor vendible evaluado × 100.</p>
      <table className="risk-status-table"><caption>Detalle por estado · {model.horizon ? `+${model.horizon} días` : 'Actual'}</caption><thead><tr><th>Estado</th><th>Valor vendible</th><th>Porcentaje</th><th>Productos (SKU)</th></tr></thead><tbody>{model.rows.map(row => <tr key={row.status}><th><i style={{ backgroundColor: row.color }} />{row.status}</th><td>{row.value}</td><td>{row.share}</td><td>{row.products}</td></tr>)}</tbody></table>
      <div className="risk-priority-list"><h3>Productos prioritarios para revisar</h3>{model.products.length ? <ul>{model.products.map(row => <li key={`${row.storeId}-${row.product}`}><i style={{ backgroundColor: row.color }} /><strong>{row.product}</strong><span>{row.store} · {row.coverageDays == null ? 'Sin movimiento' : `Cobertura: ${row.coverage}`}</span></li>)}</ul> : <p>Sin productos prioritarios para estos filtros.</p>}</div>
    </div> : <>
    <dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId="predictive-projection" label="Valor de inventario en riesgo por tienda según horizonte" option={model.option} onClick={ignoreClick} /></div></dashboard-chart>
    <div className="projection-health-summary">{model.rows.map(row => <span key={row.status} title={`${row.status}: ${row.value}`}><i style={{ backgroundColor: row.color }} /><strong>{row.status}</strong><b>{row.share}</b><em>{row.products} SKU</em></span>)}</div>
    <div className="projection-priority-products"><small>PRODUCTOS A REVISAR · {model.horizon ? `+${model.horizon}D` : "ACTUAL"}</small><div>{model.products.length ? model.products.map(row => <span key={`${row.storeId}-${row.product}`} title={`${row.product} · ${row.store} · ${row.coverageDays == null ? "sin movimiento" : row.coverage}`}><i style={{ backgroundColor: row.color }} />{row.product} · {row.store}</span>) : <span>N/A</span>}</div></div>
    </>}
  </article>;
}
