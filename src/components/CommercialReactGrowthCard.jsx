import React from "react";
import CommercialReactChart from "./CommercialReactChart";
import CommercialFilterScope from "./CommercialFilterScope";

const ignoreClick = () => {};

export default function CommercialReactGrowthCard({ model }) {
  return <article className="card chart-card growth" data-react-commercial-module="growth-card">
    <CommercialFilterScope except="No aplica mes ni rango de fechas" />
    <h2><svg><use href="/comercial/assets/icons.svg#trend" /></svg> TENDENCIA INTERANUAL ACUMULADA VENTAS{model.periodLabel && <span className="chart-title-period"> · {model.periodLabel}</span>}</h2>
    <dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "auto", minHeight: 0, overflow: "hidden", flex: 1 }}>
      <div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}>
        <CommercialReactChart chartId="growth" label="Venta acumulada del año seleccionado frente al año anterior" onClick={ignoreClick} option={model.option} />
      </div>
    </dashboard-chart>
  </article>;
}
