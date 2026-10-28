import React from "react";

function TimeControl({ label, value, unit, onValue, onUnit }) {
  const unitLabel = { "VENTANA DEMANDA": "ventana de demanda", "INVENTARIO SALUDABLE": "inventario saludable", "SOBRESTOCK DESDE": "sobrestock", "SIN MOVIMIENTO": "sin movimiento" }[label];
  return <label className="predictive-number"><span>{label}</span><div><input type="number" min="1" step="1" value={value} onChange={event => onValue(event.target.value)} /><select aria-label={`Unidad de ${unitLabel}`} value={unit} onChange={event => onUnit(event.target.value)}><option value="MONTHS">MESES</option><option value="YEARS">AÑOS</option></select></div></label>;
}

export default function CommercialReactPredictiveParameters({ model, onAction }) {
  const emit = (type, value) => onAction({ type, value });
  return <div className="predictive-parameters" data-react-commercial-module="predictive-parameters">
    <div className="predictive-rubro-control"><span>RUBRO</span><div className="predictive-toggle"><button type="button" className={model.rubros.includes("TEXTIL") ? "active" : undefined} onClick={() => emit("rubro", "TEXTIL")}>TEXTIL</button><button type="button" className={model.rubros.includes("CALZADO") ? "active" : undefined} onClick={() => emit("rubro", "CALZADO")}>CALZADO</button></div></div>
    {model.storeLocked ? <label><span>TIENDA</span><select disabled aria-label="Tienda asignada"><option>{model.lockedStore || "SIN TIENDA ASIGNADA"}</option></select></label> : <label><span>TIENDA</span><select value={model.store} onChange={event => emit("store", event.target.value)}><option value="TODAS">TODAS</option>{model.stores.map(store => <option key={store.id} value={store.id}>{store.label}</option>)}</select></label>}
    <TimeControl label="VENTANA DEMANDA" value={model.demand.value} unit={model.demand.unit} onValue={value => emit("demand-value", value)} onUnit={value => emit("demand-unit", value)} />
    <TimeControl label="INVENTARIO SALUDABLE" value={model.healthy.value} unit={model.healthy.unit} onValue={value => emit("healthy-value", value)} onUnit={value => emit("healthy-unit", value)} />
    <TimeControl label="SOBRESTOCK DESDE" value={model.overstock.value} unit={model.overstock.unit} onValue={value => emit("overstock-value", value)} onUnit={value => emit("overstock-unit", value)} />
    <TimeControl label="SIN MOVIMIENTO" value={model.noMovement.value} unit={model.noMovement.unit} onValue={value => emit("no-movement-value", value)} onUnit={value => emit("no-movement-unit", value)} />
    <label className="predictive-number"><span>MERMA</span><div><input type="number" min="0" max="50" step="1" value={model.merma} onChange={event => emit("merma", event.target.value)} /><b>%</b></div></label>
  </div>;
}
