import React from "react";

export default function CommercialReactSizeDetailModal({ model, onClose }) {
  return <section className="card chart-card chart-expanded size-detail-modal" data-react-commercial-module="size-detail-modal" role="dialog" aria-modal="true" aria-labelledby="size-detail-title" tabIndex={-1} onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
    <button type="button" className="chart-expand" aria-label="Cerrar detalle por talla" onClick={onClose}>×</button>
    <h2 id="size-detail-title">VENTA Y STOCK · {model.rubro} · TALLA {model.size}{model.rubro === "CALZADO" ? ` ${model.system}` : ""}</h2>
    <p>Venta de 90 días hasta {model.period}. Stock al {model.stockCutoff}.</p>
    {!model.loading && <div className="size-detail-totals"><strong>Venta: {model.totalSales}</strong><strong>Stock: {model.totalStock}</strong><strong>{model.rows.length} productos</strong></div>}
    {model.loading ? <p role="status">Cargando stock y productos de esta talla…</p> : <div className="ticket-monthly-table size-detail-table"><table aria-label="Productos agrupados por marca, venta y stock"><thead><tr><th colSpan={2}>Producto por marca</th><th>Código Nissei</th><th>Venta 90D</th><th>Stock</th></tr></thead>{model.brandGroups.map(group => <tbody key={group.brand}><tr className="size-detail-brand"><th colSpan={3} scope="rowgroup">{group.brand} · {group.count} productos</th><td>{group.sales}</td><td>{group.stock}</td></tr>{group.rows.map((row, index) => <tr key={`${row.code}-${index}`}><th colSpan={2} scope="row" className="size-detail-product">{row.product}</th><td>{row.code}</td><td>{row.sales}</td><td>{row.stock}</td></tr>)}</tbody>)}</table>{!model.rows.length && <p>Sin productos para la talla y los filtros seleccionados.</p>}</div>}
  </section>;
}
