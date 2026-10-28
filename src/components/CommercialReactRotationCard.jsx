import React from "react";
import CommercialReactChart from "./CommercialReactChart";

const ignoreClick = () => {};

function Chart({ id, label, option }) {
  return <dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId={id} label={label} option={option} onClick={ignoreClick} /></div></dashboard-chart>;
}

export default function CommercialReactRotationCard({ model, onAction }) {
  const rotation = model.view === "rotation";
  return <article className="card chart-card rotation-card" data-stock-hierarchy-ready={model.hierarchyReady ? "true" : undefined} data-react-commercial-module="rotation-card">
    <div className="rotation-title"><h2><svg><use href={rotation ? "assets/icons.svg#rotate" : "assets/icons.svg#warehouse"} /></svg> {rotation ? "ROTACIÓN POR TIENDA · 30D" : "CAPACIDAD Y PARTICIPACIÓN"}</h2><div className="rotation-switch"><button type="button" className={rotation ? "active" : undefined} onClick={() => onAction({ type: "view", value: "rotation" })} aria-label="Ver rotación por tienda">ROT.</button><button type="button" className={!rotation ? "active" : undefined} onClick={() => onAction({ type: "view", value: "inventory" })} aria-label="Ver capacidad y participación">CAP.</button></div></div>
    {rotation ? model.ready ? <Chart id="inventory-rotation" label="Rotación de inventario de 30 días" option={model.rotationOption} /> : <div className="card-inline-loader" role="status"><span className="loader" />Preparando rotación de inventario…</div> : <>
      <div className="inventory-overview-content"><div className="capacity-donut"><Chart id="inventory-capacity" label="Anillo exterior: valor de inventario por área. Anillo interior: ocupación de la capacidad física." option={model.capacityOption} /><div className="capacity-center" title="Fórmula: unidades en stock ÷ capacidad total de las tiendas filtradas × 100."><strong>{model.occupancy}</strong><small>OCUPACIÓN</small></div></div><ul className="inventory-area-legend" aria-label="Participación del inventario por área">{model.areas.map(area => <li key={area.area}><i style={{ background: area.color }} /><span>{area.area}</span><strong>{area.share}</strong></li>)}</ul></div>
      <div className="inventory-ring-guide"><span>EXTERIOR · VALOR POR ÁREA</span><span>INTERIOR · CAPACIDAD EN UNIDADES</span></div>
      <div className="capacity-facts"><span title="Fórmula: Σ(valor de stock) de las tiendas filtradas; el rubro no cambia esta vista general."><small>VALOR DEL STOCK</small><strong>{model.stockValue}</strong></span><span title="Fórmula: valor absoluto de capacidad total − unidades en stock; si es negativo, se muestra como sobrecapacidad." className={model.overCapacity ? "negative" : undefined}><small>{model.overCapacity ? "SOBRECAPACIDAD" : "CAPACIDAD LIBRE"}</small><strong>{model.capacityDifference}</strong></span></div>
    </>}
  </article>;
}
