import React from "react";

export default function CommercialReactTalentCapacity({ model }) {
  return <article className="card talent-card capacity-card" data-react-commercial-module="talent-capacity" style={model.storeLocked ? { height: 180, minHeight: 180 } : undefined}>
    <div className="talent-chart-title"><h2><svg><use href="/comercial/assets/icons.svg#warehouse" /></svg> DOTACIÓN POR TIENDA</h2></div>
    <div className="talent-table"><div className="talent-head"><span>TIENDA</span><span>NORMAL</span><span>CAMPAÑA</span><span>REAL</span><span>BRECHA</span><span>VENTA/COLAB.</span></div>
      {model.rows.map(row => <div key={row.alias}><strong>{row.alias}</strong><span>{row.baseStaff}</span><span>{row.campaignStaff}</span><span>{row.staff}</span><span className={row.gapPositive ? "positive" : "negative"}>{row.gap}</span><span>{row.productivity}</span></div>)}
    </div>
  </article>;
}
