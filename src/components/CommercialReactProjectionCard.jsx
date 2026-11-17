import React from "react";
export default function CommercialReactProjectionCard({ model }) {
  const columns = [model.products.slice(0, 5), model.products.slice(5, 10)];
  const total = model.rows.reduce((sum, row) => sum + row.productCount, 0);
  return <article className="card predictive-v2-card predictive-projection-card priority-replenishment-card" aria-busy={model.loading || undefined} data-react-commercial-module="projection-card">
    {model.loading && <div className="predictive-card-refresh" role="status">Actualizando prioridad…</div>}
    <div className="title-row"><span className="card-letter">C</span><h2><svg><use href="/comercial/assets/icons.svg#alert" /></svg> PRIORIDAD DE REPOSICIÓN</h2></div>
    {model.error && <p className="projection-store-error" role="alert">{model.error}</p>}
    <div className="priority-status-bar" role="img" aria-label={`Prioridad de reposición a 90 días: ${model.rows.map(row => `${row.status} ${row.share}`).join(', ')}`}>
      {model.rows.map(row => <span key={row.status} style={{ flexGrow: row.productCount || 0, backgroundColor: row.color }} title={`${row.status}: ${row.value} · ${row.share}`} />)}
    </div>
    <div className="priority-status-legend">{model.rows.map(row => <span key={row.status}><i style={{ backgroundColor: row.color }} />{row.status}<b>{row.products} SKU</b></span>)}{total === 0 && <span>Sin datos evaluados</span>}</div>
    <section className="priority-products-matrix" aria-label="Productos prioritarios">
      <h3>PRODUCTOS PRIORITARIOS</h3>
      {model.products.length ? <div className="priority-products-columns">{columns.map((rows, index) => <div className="priority-products-column" key={index}><div className="priority-products-head"><span>CÓDIGO</span><span>DESCRIPCIÓN</span><span>COBERTURA</span></div>{rows.map(row => <div className="priority-product-row" key={`${row.storeId}-${row.code || row.product}`}><strong title={row.code}>{row.code || 'S/C'}</strong><span title={row.product}>{row.product}</span><em>{row.coverageDays == null ? 'Sin rotación' : row.coverage}</em></div>)}</div>)}</div> : <p>Sin productos prioritarios para estos filtros.</p>}
    </section>
  </article>;
}
