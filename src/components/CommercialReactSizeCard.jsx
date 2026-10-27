import React from "react";
import CommercialReactChart from "./CommercialReactChart";
import CommercialReactSizeControls from "./CommercialReactSizeControls";

const ignoreClick = () => {};

export default function CommercialReactSizeCard({ model, onAction }) {
  const emit = (type, value) => onAction({ type, value });
  return <article className={`card chart-card size-distribution-card${model.expanded ? " chart-expanded" : ""}`} data-react-commercial-module="size-card">
    <button type="button" className="chart-expand" onClick={() => emit("expand")} aria-label={model.expanded ? "Cerrar gráfico" : "Ampliar gráfico"}>{model.expanded ? "×" : "⛶"}</button>
    <div className="inventory-chart-heading"><h2><svg><use href="/comercial/assets/icons.svg#comparison" /></svg> VENTA, STOCK Y TRASLADOS POR TALLA</h2></div>
    <CommercialReactSizeControls model={model.controls} onAction={onAction} />
    {model.loading ? <div className="card-inline-loader"><span className="loader" />{model.metric === "TRANSFERS" ? "Preparando traslados por talla…" : "Preparando gráfico de tallas…"}</div> : <>
      {model.productCodeLoading ? <div className="card-inline-loader card-inline-loader--overlay" role="status" aria-label="Cargando tallas"><span className="loader" /></div>
        : model.textilEmpty ? <div className="card-inline-loader card-inline-loader--overlay" role="status"><strong>Sin tallas textiles mapeadas en los códigos actuales.</strong>{model.codeError && <button type="button" className="retry-button" onClick={() => emit("retry")}>REINTENTAR</button>}</div>
          : model.codeError && model.noRows ? <div className="card-inline-loader card-inline-loader--overlay"><strong>No se pudieron identificar las tallas.</strong><button type="button" className="retry-button" onClick={() => emit("retry")}>REINTENTAR</button></div> : null}
      <dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId="inventory-sizes" label={model.label} onClick={ignoreClick} option={model.option} /></div></dashboard-chart>
      <div className="size-chart-summary"><span><small>SKU DEL RUBRO</small><strong>{model.coverage.total}</strong></span><span><small>SKU MAPEADOS</small><strong>{model.coverage.mapped}</strong></span><span className={model.coverage.pendingRaw > 0 ? "pending" : undefined}><small>SKU PENDIENTES</small><strong>{model.coverage.pending}</strong></span></div>
    </>}
  </article>;
}
