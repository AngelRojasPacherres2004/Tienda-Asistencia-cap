import React from "react";
import capacityStyles from "./CommercialReactTalentCapacity.css?raw";

export default function CommercialReactTalentCapacity({ model }) {
  return <article className="card talent-card capacity-card" data-react-commercial-module="talent-capacity" style={{ height: "auto", minHeight: 0 }}>
    <style>{capacityStyles}</style>
    <div className="talent-chart-title"><h2><svg><use href="/comercial/assets/icons.svg#warehouse" /></svg> DOTACIÓN POR TIENDA</h2></div>
    <div className="talent-table"><div className="talent-head"><span>TIENDA</span><span>NORMAL</span><span>CAMPAÑA</span><span>REAL</span><span>BRECHA</span><span>VENTA/COLAB.</span></div>
      {model.rows.map(row => <div key={row.alias}><strong>{row.alias}</strong><span data-label="Normal">{row.baseStaff}</span><span data-label="Campaña">{row.campaignStaff}</span><span data-label="Real">{row.staff}</span><span data-label="Brecha" className={row.gapPositive ? "positive" : "negative"}>{row.gap}</span><span data-label="Venta/colab.">{row.productivity}</span></div>)}
    </div>
  </article>;
}
