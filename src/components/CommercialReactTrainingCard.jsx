import React from "react";
import CommercialReactChart from "./CommercialReactChart";

const ignoreClick = () => {};

export default function CommercialReactTrainingCard({ model, onAction }) {
  return <article className={`card talent-card training-card${model.expanded ? " chart-expanded" : ""}`} data-react-commercial-module="talent-training-card">
    <button type="button" className="chart-expand" aria-label={model.expanded ? "Cerrar detalle de capacitación" : "Ampliar y ver detalle de capacitación"} onClick={() => onAction({ type: "expand" })}>{model.expanded ? "×" : "⛶"}</button>
    <div className="talent-chart-title"><h2><svg><use href="/comercial/assets/icons.svg#trend" /></svg> {model.storeLocked ? "CURSOS PENDIENTES DE VENDEDORES" : "AVANCE DE CAPACITACIÓN"}</h2>
      <div className="talent-training-switch" hidden={model.storeLocked} role="group" aria-label="Tipo de personal para capacitación"><button type="button" className={model.audience === "SELLERS" ? "active" : undefined} onClick={() => onAction({ type: "audience", value: "SELLERS" })}>VENDEDORES</button><button type="button" className={model.audience === "ADMINISTRATORS" ? "active" : undefined} onClick={() => onAction({ type: "audience", value: "ADMINISTRATORS" })}>ADMINISTRADORES</button></div>
    </div>
    <dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId="talent-training" label={model.label} onClick={ignoreClick} option={model.option} /></div></dashboard-chart>
  </article>;
}
