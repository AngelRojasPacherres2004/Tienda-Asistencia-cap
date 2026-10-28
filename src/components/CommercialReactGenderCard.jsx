import React from "react";
import CommercialReactChart from "./CommercialReactChart";

const ignoreClick = () => {};
const chartStyle = { boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 };

function Chart({ id, label, option, className }) {
  return <dashboard-chart class={className} style={chartStyle}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId={id} label={label} option={option} onClick={ignoreClick} /></div></dashboard-chart>;
}

export default function CommercialReactGenderCard({ model, onAction }) {
  return <article className={`card chart-card gender-card${model.expanded ? " chart-expanded" : ""}`} data-react-commercial-module="gender-card">
    <button type="button" className="chart-expand" onClick={() => onAction({ type: "expand" })} aria-label={model.expanded ? "Cerrar gráfico" : "Ampliar participación por género"}>{model.expanded ? "×" : "⛶"}</button>
    <h2><svg><use href="/comercial/assets/icons.svg#category" /></svg> PARTICIPACIÓN GÉNERO</h2>
    <div className="gender-chart-content"><div className="gender-donut-pane"><Chart id="gender-donut" label="Participación de venta por género" option={model.donut} /><div className="gender-rubro-toggle" aria-label="Rubros incluidos en participación por género">{["TEXTIL", "CALZADO"].map(rubro => <button key={rubro} type="button" className={model.rubros.includes(rubro) ? "active" : undefined} onClick={() => onAction({ type: "rubro", value: rubro })}>{rubro}</button>)}</div></div>
      {model.expanded && <Chart id="gender-bar" label="Comparación de venta por género" option={model.bar} className="gender-bar-chart" />}
    </div>
  </article>;
}
