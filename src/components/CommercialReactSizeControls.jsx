import React from "react";

export default function CommercialReactSizeControls({ model, onAction }) {
  const emit = (type, value) => onAction({ type, value });
  return <div className="size-chart-controls" data-react-commercial-module="size-controls">
    <div role="group" aria-label="Rubro de tallas"><button type="button" className={model.rubro === "CALZADO" ? "active" : undefined} onClick={() => emit("rubro", "CALZADO")}>CALZADO</button><button type="button" className={model.rubro === "TEXTIL" ? "active" : undefined} onClick={() => emit("rubro", "TEXTIL")}>TEXTIL</button></div>
    <span className="size-chart-comparison-label">VENTA 90D VS STOCK</span>
    {model.rubro === "CALZADO" && <div role="group" aria-label="Sistema de talla"><button type="button" className={model.system === "USA" ? "active" : undefined} onClick={() => emit("system", "USA")}>USA</button><button type="button" className={model.system === "EUR" ? "active" : undefined} onClick={() => emit("system", "EUR")}>EUR</button></div>}
  </div>;
}
