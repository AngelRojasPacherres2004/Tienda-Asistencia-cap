import React from "react";

export default function CommercialReactStockMatrix({ model }) {
  return <section className="inventory-matrix-card inventory-matrix-card--embedded" aria-label="Resumen de stock por tienda" data-react-commercial-module="stock-matrix">
    <div className="inventory-matrix-heading"><h2><svg><use href="/comercial/assets/icons.svg#comparison" /></svg> RESUMEN DE STOCK POR TIENDA</h2></div>
    <div className="inventory-matrix-scroll"><table>
      <colgroup><col className="store-col"/><col className="capacity-col"/><col className="stock-col"/><col className="income-col"/><col className="sales-col"/><col className="coverage-col"/><col className="status-col"/></colgroup>
      <thead><tr><th>TIENDA</th><th>CAPACIDAD</th><th>STOCK</th><th title="Ingreso promedio diario: FactIngresos; si no hay registro, conciliación de stock y ventas">INGRESO<br/>PROM.</th><th title="Venta promedio diaria">VENTA<br/>PROM.</th><th>COBERTURA</th><th>ESTADO</th></tr></thead>
      <tbody>{model.rows.length ? model.rows.map(row => <tr key={row.storeId} className={row.tone}>
        <th title={row.alias}>{row.alias}</th><td title={row.capacityTitle}>{row.capacity}</td><td title={row.stockTitle}>{row.stock}</td><td title={row.receivedTitle}>{row.received}</td><td title={row.salesTitle}>{row.sales}</td><td title={row.coverageTitle}>{row.coverage}</td><td><strong className={`status-pill ${row.tone}`}>{row.status}</strong></td>
      </tr>) : <tr><td colSpan={7}>N/A</td></tr>}</tbody>
    </table></div>
  </section>;
}
