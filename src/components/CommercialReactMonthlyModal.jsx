import React from "react";
import CommercialReactChart from "./CommercialReactChart";

const ignoreClick = () => {};

export default function CommercialReactMonthlyModal({ model, onAction }) {
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
    <h2 id={model.titleId}>{model.title} · {model.year}</h2>
    <div className="ticket-modal-filters"><label className="ticket-year-selector">Año <select value={model.year} onChange={event => onAction({ type: "year", value: Number(event.target.value) })}>{model.years.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
      {!model.storeLocked && <div className="filter-field"><span>Tiendas</span><details className="filter-dropdown"><summary>{model.selectedStores.length ? `${model.selectedStores.length} seleccionadas` : model.allStoresLabel}</summary><div className="filter-menu"><button type="button" onClick={() => onAction({ type: "clear-stores" })}>Todas</button>{model.stores.map(store => <button key={store.storeId} type="button" className={model.selectedStores.includes(store.storeId) ? "active" : undefined} aria-pressed={model.selectedStores.includes(store.storeId)} onClick={() => onAction({ type: "store", value: store.storeId })}>{store.label}</button>)}</div></details></div>}
    </div>
    {!model.hasData && <p role="status">{model.emptyText}</p>}
    <div className="ticket-modal-content"><dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId={model.chartId} label={model.chartLabel} option={model.option} onClick={ignoreClick} /></div></dashboard-chart>
      <div className="ticket-monthly-table"><table aria-label={model.tableLabel}><thead><tr>{model.headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{model.rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{row.cells.map((cell, index) => <td key={index} className={cell.className} title={cell.title}>{cell.text}</td>)}</tr>)}</tbody></table></div>
    </div>
    {model.legend && <><div className="ticket-extremes-legend" aria-label="Leyenda de valores destacados"><span className="ticket-extreme-max">↑ Máximo</span><span className="ticket-extreme-min">↓ Mínimo</span><span className="ticket-extreme-equal">↕ Máximo y mínimo iguales</span></div><p>Se resaltan todos los empates. Los meses sin transacciones no participan en los máximos y mínimos.</p></>}
  </section>;
}
