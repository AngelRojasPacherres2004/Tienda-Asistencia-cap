import React from "react";
import CommercialReactChart from "./CommercialReactChart";
import CommercialFilterScope from './CommercialFilterScope';

const ignoreClick = () => {};

export default function CommercialReactSimpleChartCard({ model, onAction = ignoreClick }) {
  return <article className={`${model.baseClasses || "card chart-card"} ${model.cardClass}`} data-react-commercial-module={model.moduleId}>
    {model.expandable && <button type="button" className="chart-expand" aria-label={model.expandLabel} onClick={() => onAction({ type: model.action || "expand" })}>⛶</button>}
    <h2><svg><use href={`/comercial/assets/icons.svg#${model.icon}`} /></svg> {model.title}{model.periodLabel && <span className="chart-title-period"> · {model.periodLabel}</span>}</h2>
    {model.chartId === 'meta-vs-real' && <CommercialFilterScope except="No aplica mes ni rango de fechas" />}
    {model.chartId === 'hourly-performance' && <CommercialFilterScope except="No aplica rubro, línea ni sublínea" />}
    {model.ready ? <dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}>
      <div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}>
        <CommercialReactChart chartId={model.chartId} label={model.label} onClick={ignoreClick} option={model.option} />
      </div>
    </dashboard-chart> : <div className="card-inline-loader" role="status"><span className="loader" />{model.loadingText}</div>}
  </article>;
}
