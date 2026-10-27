import React from "react";
import CommercialReactChart from "./CommercialReactChart";

const ignoreClick = () => {};
const metrics = [["ROTATION", "ROTACIÓN"], ["MARKUP", "MARKUP"], ["TICKET", "TICKET PROM."], ["SALE_M2", "VENTA × M²"]];

export default function CommercialReactRankingCard({ model, onAction }) {
  return <article className="card chart-card commercial-ranking-card" data-react-commercial-module="ranking-card">
    <div className="ranking-title"><h2><svg><use href="/comercial/assets/icons.svg#ranking" /></svg> RANKING TIENDAS</h2><small className="ranking-store-count">{model.countLabel} · MENOR PUNTAJE = MEJOR</small><div className="ranking-metric-toggle" aria-label="Variables del ranking de tiendas">{metrics.map(([key, label]) => <button key={key} type="button" className={model.metrics.includes(key) ? "active" : undefined} aria-pressed={model.metrics.includes(key)} onClick={() => onAction({ type: "metric", value: key })}>{label}</button>)}</div></div>
    <dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId="store-ranking" label="Puntaje acumulado de tiendas según las variables comerciales seleccionadas" onClick={ignoreClick} option={model.option} /></div></dashboard-chart>
  </article>;
}
