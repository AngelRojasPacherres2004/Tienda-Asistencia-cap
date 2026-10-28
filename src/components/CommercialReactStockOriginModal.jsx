import React from "react";

export default function CommercialReactStockOriginModal({ model, onAction }) {
  const close = () => onAction({ type: "close" });
  return <section className="card chart-card chart-expanded ticket-modal stock-origin-detail" data-react-commercial-module="stock-origin-modal" role="dialog" aria-modal="true" aria-labelledby="stock-origin-detail-title" onKeyDown={event => { if (event.key === "Escape") close(); }}>
    <button type="button" className="chart-expand" aria-label="Cerrar detalle de antigüedad" onClick={close}>×</button>
    <h2 id="stock-origin-detail-title">STOCK DE ORIGEN {model.period} · UBICACIÓN POR TIENDA</h2>
    <p>Stock al {model.cutoff}. Respeta los filtros del gráfico.</p>
    <p>{model.units} · {model.value}</p>
    <p>Detalle por tienda, rubro, línea y sublínea. La fuente de antigüedad no contiene códigos ni nombres individuales de productos.</p>
    <div className="ticket-monthly-table" style={{ flex: 1, minHeight: 0 }}><table aria-label="Ubicación y cantidad de stock del mes de origen"><thead><tr><th scope="col">Tienda</th><th scope="col">Código tienda</th><th scope="col">Rubro</th><th scope="col">Línea</th><th scope="col">Sublínea</th><th scope="col">Unidades</th><th scope="col">Valor stock</th></tr></thead><tbody>{model.rows.length ? model.rows.map((row, index) => <tr key={`${row.storeId}-${row.category}-${row.line}-${row.subline}-${index}`}><th scope="row">{row.store}</th><td>{row.storeId}</td><td>{row.category}</td><td>{row.line}</td><td>{row.subline}</td><td>{row.units}</td><td>{row.value}</td></tr>) : <tr><td colSpan={7}>Sin datos para estos filtros.</td></tr>}</tbody></table></div>
  </section>;
}
