import React from "react";
export default function CommercialReactReplenishmentCard({ model, onAction }) {
  return <article className={`card predictive-v2-card predictive-replenishment-card replenishment-matrix-card${model.expanded ? " chart-expanded" : ""}`} aria-busy={model.loading || undefined} data-react-commercial-module="replenishment-card">
    {model.loading && <div className="predictive-card-refresh" role="status">Actualizando reposición…</div>}
    <button type="button" className="chart-expand" onClick={() => onAction({ type: "expand" })} aria-label={model.expanded ? "Cerrar detalle de reposición" : "Ampliar prioridad por marca"}>{model.expanded ? "×" : "⛶"}</button>
    <div className="title-row"><span className="card-letter">B</span><h2><svg><use href="/comercial/assets/icons.svg#reorder" /></svg> PRIORIDAD DE REPOSICIÓN POR MARCA</h2></div>
    <div className="replenishment-matrix" aria-label="Detalle de prioridad de reposición por marca">
      <div className="replenishment-matrix-head"><span>MARCA</span><span>PRIORIDAD</span><span>REPOSICIÓN</span><span>COBERTURA</span><span>STOCK VENDIBLE</span></div>
      <div className="replenishment-matrix-body">{model.rows.length ? model.rows.map(row => <button type="button" className={row.selected ? "selected" : ""} key={row.name} onClick={() => onAction({ type: "brand", value: row.name })} aria-pressed={row.selected} title={`Ver productos de ${row.name}`}><strong title={row.name}>{row.name}</strong><span className="status-cell"><i style={{ backgroundColor: row.color }} />{row.priority}</span><span>{row.deficitUnits}</span><span>{row.coverage}</span><span>{row.vendibleUnits}</span></button>) : <p>N/A</p>}</div>
    </div>
    {model.expanded && <section className="replenishment-products" aria-live="polite" aria-label={`Productos de ${model.selectedBrand || "la marca seleccionada"}`}>
      <h3>{model.selectedBrand ? `PRODUCTOS · ${model.selectedBrand}` : "SELECCIONA UNA MARCA"}</h3>
      {model.detailLoading ? <div className="replenishment-detail-loading"><span className="loader" />Cargando productos…</div>
        : model.detailRows?.length ? <div className="replenishment-products-table"><div className="replenishment-products-head"><span>CÓDIGO</span><span>DESCRIPCIÓN</span><span>COBERTURA</span><span>STOCK VENDIBLE</span></div><div className="replenishment-products-body">{model.detailRows.map(row => <div key={`${row.code}-${row.product}`}><strong title={row.code}>{row.code || "S/C"}</strong><span title={row.product}>{row.product}</span><span>{row.coverage}</span><span>{row.vendibleUnits}</span></div>)}</div></div>
          : <p>{model.selectedBrand ? "No hay productos para los filtros actuales." : "Selecciona una fila para ver sus productos."}</p>}
    </section>}
  </article>;
}
