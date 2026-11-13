import React from "react";
import CommercialReactChart from "./CommercialReactChart";
import CommercialChartZoomFilters from "./CommercialChartZoomFilters";
import { highlightNumericColumns } from '../lib/monthlyTableExtremes';

const ignoreClick = () => {};

export default function CommercialReactMonthlyModal({ model, onAction }) {
  const showResults = model.keepResults || (!model.loading && !model.retryTraffic);
  const highlight = model.moduleId === 'projection-close-modal';
  const rows = highlight ? highlightNumericColumns(model.rows) : model.rows;
  const sellerRows = (model.sellerDetail?.rows || []).map(row => ({ label: row.seller, cells: [{ text: row.net, value: row.value }] }));
  const sellers = highlight ? highlightNumericColumns(sellerRows) : sellerRows;
  const close = () => onAction({ type: "close" });
  const onKeyDown = event => {
    if (event.key === "Escape") { event.stopPropagation(); close(); }
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll("button:not([disabled]), select:not([disabled]), summary")];
    if (!controls.length) return;
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <section className="card chart-card chart-expanded ticket-modal" data-react-commercial-module={model.moduleId} role="dialog" aria-modal="true" aria-labelledby={model.titleId} tabIndex={-1} onKeyDown={onKeyDown}>
    <button type="button" className="chart-expand" aria-label={model.closeLabel} onClick={close}>×</button>
    <h2 id={model.titleId}>{model.title}{model.showYear === false ? "" : ` · ${model.year}`}</h2>
    <div className="ticket-modal-filters">{model.years.length > 1 && <label className="ticket-year-selector">Año <select value={model.year} onChange={event => onAction({ type: "year", value: Number(event.target.value) })}>{model.years.map(year => <option key={year} value={year}>{year}</option>)}</select></label>}
      {!model.storeLocked && <div className="filter-field"><span>Tiendas</span><details className="filter-dropdown"><summary>{model.selectedStores.length ? `${model.selectedStores.length} seleccionadas` : model.allStoresLabel}</summary><div className="filter-menu"><button type="button" onClick={() => onAction({ type: "clear-stores" })}>Todas</button>{model.stores.map(store => <button key={store.storeId} type="button" className={model.selectedStores.includes(store.storeId) ? "active" : undefined} aria-pressed={model.selectedStores.includes(store.storeId)} onClick={() => onAction({ type: "store", value: store.storeId })}>{store.label}</button>)}</div></details></div>}
    </div>
    {model.hierarchyFilters && <CommercialChartZoomFilters filters={model.hierarchyFilters} keys={model.hierarchyFilterKeys} onAction={onAction} />}
    {showResults && !model.hasData && <p role="status">{model.emptyText}</p>}
    {model.dataNote && <p className="kpi-data-note" role="status">{model.dataNote}</p>}
    {model.retryTraffic && <button type="button" onClick={() => onAction({ type: "retry-traffic" })}>Reintentar</button>}
    {showResults && <>
    <div className={`ticket-modal-content${model.sellerDetail ? " ticket-modal-content--seller" : ""}${model.hideChart ? " ticket-modal-content--matrix" : ""}`}>{!model.hideChart && <dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId={model.chartId} label={model.chartLabel} option={model.option} onClick={ignoreClick} /></div></dashboard-chart>}
      <div className="ticket-monthly-table"><table aria-label={model.tableLabel}><thead><tr>{model.headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{row.cells.map((cell, index) => <td key={index} className={cell.className} title={cell.title}>{cell.text}</td>)}</tr>)}</tbody></table></div>
      {model.sellerDetail && <section className="kpi-seller-detail" aria-label="Ranking de ventas por vendedor">
      <div className="kpi-seller-detail__heading"><h3>RANKING DE VENTAS POR VENDEDOR</h3><label>Período <select value={model.sellerDetail.month} onChange={event => onAction({ type: "month", value: Number(event.target.value) })}><option value={0}>Filtros actuales</option>{model.rows.map((row, index) => <option key={row.label} value={index + 1}>{row.label}</option>)}</select></label></div>
      {model.sellerDetail.loading ? <p>Cargando vendedores…</p> : <div className="ticket-monthly-table"><table><thead><tr><th>Vendedor</th><th>Venta neta</th></tr></thead><tbody>{sellers.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td className={row.cells[0].className} title={row.cells[0].title}>{row.cells[0].text}</td></tr>)}</tbody><tfoot><tr><th>Total · {model.sellerDetail.personnel} colaboradores promedio</th><td>{model.sellerDetail.net}</td></tr></tfoot></table></div>}
      <p className="kpi-seller-detail__total">Venta por colaborador: <strong>{model.sellerDetail.kpi}</strong></p>
    </section>}
    </div>
    {highlight && <div className="ticket-extremes-legend" aria-label="Colores de la tabla"><span className="ticket-extreme-min">Menor valor por columna</span><span className="ticket-extreme-max">Mayor valor por columna</span></div>}
    {model.legendItems?.length ? <div className="kpi-chart-legend" aria-label="Leyenda del gráfico">{model.legendItems.map(item => <span key={item.label}><i style={{ backgroundColor: item.color }} />{item.label}</span>)}</div> : null}
    </>}
  </section>;
}
