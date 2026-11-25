import React from "react";
import CommercialReactChart from "./CommercialReactChart";

const ignoreClick = () => {};

function Chart({ id, label, option }) {
  return <dashboard-chart style={{ boxSizing: "border-box", display: "block", width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden", flex: 1 }}><div className="chart-host" style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 0, overflow: "hidden" }}><CommercialReactChart chartId={id} label={label} option={option} onClick={ignoreClick} /></div></dashboard-chart>;
}

export default function CommercialReactRotationCard({ model }) {
  return <article className="card chart-card rotation-card" data-stock-hierarchy-ready={model.hierarchyReady ? "true" : undefined} data-react-commercial-module="rotation-card">
    <style>{`@media(max-width:600px){
      .rotation-card { height:auto!important; min-height:0!important; }
      .rotation-card .inventory-overview-content { display:flex; flex-direction:column; flex:none; gap:14px; }
      .rotation-card .capacity-donut { flex:none; width:100%; height:240px; min-height:240px; }
      .rotation-card .capacity-center strong { font-size:22px; }
      .rotation-card .capacity-center small { font-size:10px; }
      .rotation-card .inventory-area-legend { display:grid; grid-template-columns:1fr; gap:10px; padding:0 4px; }
      .rotation-card .inventory-area-legend li { grid-template-columns:10px minmax(0,1fr) auto; gap:8px; font-size:12px; }
      .rotation-card .inventory-area-legend strong { font-size:12px; }
      .rotation-card .inventory-ring-guide { margin-top:14px; line-height:1.5; }
      .rotation-card .capacity-facts { margin-top:12px; }
    }`}</style>
    <div className="rotation-title"><h2><svg><use href="assets/icons.svg#warehouse" /></svg> CAPACIDAD Y PARTICIPACIÓN</h2></div>
    {model.ready ? <>
      <div className="inventory-overview-content"><div className="capacity-donut"><Chart id="inventory-capacity" label="Anillo exterior: valor de inventario por área. Anillo interior: ocupación de la capacidad física." option={model.capacityOption} /><div className="capacity-center" title="Fórmula: unidades en stock ÷ capacidad total de las tiendas filtradas × 100."><strong>{model.occupancy}</strong><small>OCUPACIÓN</small></div></div><ul className="inventory-area-legend" aria-label="Participación del inventario por área">{model.areas.map(area => <li key={area.area}><i style={{ background: area.color }} /><span>{area.area}</span><strong>{area.share}</strong></li>)}</ul></div>
      <div className="inventory-ring-guide"><span>EXTERIOR · VALOR POR ÁREA</span><span>INTERIOR · CAPACIDAD EN UNIDADES</span></div>
      <div className="capacity-facts"><span title="Fórmula: Σ(valor de stock) de las tiendas filtradas; el rubro no cambia esta vista general."><small>VALOR DEL STOCK</small><strong>{model.stockValue}</strong></span><span title="Fórmula: valor absoluto de capacidad total − unidades en stock; si es negativo, se muestra como sobrecapacidad." className={model.overCapacity ? "negative" : undefined}><small>{model.overCapacity ? "SOBRECAPACIDAD" : "CAPACIDAD LIBRE"}</small><strong>{model.capacityDifference}</strong></span></div>
    </> : <div className="card-inline-loader" role="status"><span className="loader" />Preparando capacidad de inventario…</div>}
  </article>;
}
