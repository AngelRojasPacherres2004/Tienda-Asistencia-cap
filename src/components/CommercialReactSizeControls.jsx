import React from "react";

export default function CommercialReactSizeControls({ model, onAction }) {
  const emit = (type, value) => onAction({ type, value });
  return <div className="size-chart-controls" data-react-commercial-module="size-controls">
    <div role="group" aria-label="Rubro de tallas"><button type="button" className={model.rubro === "CALZADO" ? "active" : undefined} onClick={() => emit("rubro", "CALZADO")}>CALZADO</button><button type="button" className={model.rubro === "TEXTIL" ? "active" : undefined} onClick={() => emit("rubro", "TEXTIL")}>TEXTIL</button></div>
    <div role="group" aria-label="Métrica de tallas"><button type="button" className={model.metric === "SALES" ? "active" : undefined} onClick={() => emit("metric", "SALES")}>VENTA 90D</button><button type="button" className={model.metric === "STOCK" ? "active" : undefined} onClick={() => emit("metric", "STOCK")}>STOCK</button><button type="button" className={model.metric === "TRANSFERS" ? "active" : undefined} onClick={() => emit("metric", "TRANSFERS")}>TRASLADOS</button></div>
    {model.rubro === "CALZADO" && <div role="group" aria-label="Sistema de talla"><button type="button" className={model.system === "USA" ? "active" : undefined} onClick={() => emit("system", "USA")}>USA</button><button type="button" className={model.system === "EUR" ? "active" : undefined} onClick={() => emit("system", "EUR")}>EUR</button></div>}
    <div className="size-view-switch" role="group" aria-label="Vista de tallas"><button type="button" className="active" aria-pressed="true">GRÁFICO</button><button type="button" aria-pressed="false" onClick={() => emit("matrix")}>MATRIZ</button></div>
  </div>;
}
