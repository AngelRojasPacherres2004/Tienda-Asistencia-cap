import React, { useEffect, useRef, useState } from "react";
import { Package, Store, Truck, ArrowRight, Trash2, X, ChevronDown, Save, RefreshCw } from "lucide-react";
import CommercialSavedTransferGroups from "./CommercialSavedTransferGroups";

export function TransferCartButton({ count = 0, onClick, compact = false }) {
  return <button type="button" className={`transfer-cart-trigger${compact ? " is-compact" : ""}`} onClick={onClick}
    aria-label={`Ver selección de traslados, ${count} productos`} title="Ver selección de traslados">
    <Truck size={17} aria-hidden="true" />{!compact && <span>Mi selección</span>}
    <span className="transfer-cart-count">{count}</span>
  </button>;
}

export default function CommercialTransferCart({ model, onAction }) {
  const panel = useRef(null);
  const [expanded, setExpanded] = useState([]);
  const close = () => onAction({ type: "cart-close" });
  useEffect(() => {
    if (!model?.open) return;
    const root = panel.current?.getRootNode();
    const previous = root?.activeElement;
    setExpanded([]);
    panel.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [model?.open]);
  useEffect(() => {
    if (model?.open && panel.current && !panel.current.contains(panel.current.getRootNode().activeElement)) panel.current.focus();
  }, [model?.open, model?.count, model?.tab]);
  if (!model?.open) return null;
  const keyboard = event => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const buttons = [...panel.current.querySelectorAll("button:not(:disabled), input:not(:disabled), [tabindex='0']")];
    const first = buttons[0]; const last = buttons.at(-1);
    const active = panel.current.getRootNode().activeElement;
    if (event.shiftKey && (active === first || active === panel.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (active === last || active === panel.current)) { event.preventDefault(); first?.focus(); }
  };
  const saved = model.tab === "saved";
  return <div className="transfer-cart-backdrop" onClick={event => { if (event.target === event.currentTarget) close(); }} onKeyDown={keyboard}>
    <section className="transfer-cart-dialog" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="transfer-cart-title">
      <header className="transfer-cart-header"><div className="transfer-cart-heading"><span className="transfer-cart-heading-icon"><Truck size={22} /></span><div><h2 id="transfer-cart-title">Mi selección de traslados</h2><p>Productos agrupados por tienda destino</p></div></div>
        <button type="button" className="transfer-cart-icon-button" aria-label="Cerrar selección de traslados" onClick={close}><X size={20} /></button>
      </header>
      <div className="transfer-cart-sections" role="group" aria-label="Secciones de grupos"><button type="button" className={!saved ? "active" : ""} aria-pressed={!saved} onClick={() => onAction({ type: "cart-tab", value: "draft" })}>Por guardar <span>{model.groups.length}</span></button><button type="button" className={saved ? "active" : ""} aria-pressed={saved} onClick={() => onAction({ type: "cart-tab", value: "saved" })}>Guardados <span>{model.savedGroups?.length || 0}</span></button><button type="button" className="transfer-cart-refresh" disabled={Boolean(model.busy) || model.savedLoading} aria-label="Actualizar grupos guardados" onClick={() => onAction({ type: "cart-refresh" })}><RefreshCw size={15} /></button></div>
      {model.error && <div className="transfer-cart-error" role="alert">{model.error}</div>}
      <div className="transfer-cart-content">
        {saved ? <CommercialSavedTransferGroups model={model} onAction={onAction} /> : !model.count ? <div className="transfer-cart-empty"><Package size={38} strokeWidth={1.4} /><h3>Tu selección está vacía</h3><p>Abre la matriz, compara las tiendas destino y pulsa “Agregar” en los productos que quieras agrupar.</p><button type="button" className="transfer-cart-primary" onClick={close}>Seguir seleccionando</button></div>
          : model.groups.map(group => <section className="transfer-cart-group" key={group.id} aria-label={`Destino ${group.name}`}>
            <div className="transfer-cart-group-header"><button type="button" className="transfer-cart-group-toggle" aria-expanded={expanded.includes(group.id)} aria-controls={`cart-store-${group.id}`}
              onClick={() => setExpanded(current => current.includes(group.id) ? current.filter(id => id !== group.id) : [...current, group.id])}>
              <span className="transfer-cart-destination"><Store size={18} /><strong>{group.name}</strong></span><span className="transfer-cart-destination-total"><strong>{group.quantity} und</strong><ChevronDown size={17} className={expanded.includes(group.id) ? "is-open" : ""} /></span>
            </button><button type="button" className="transfer-group-save" disabled={Boolean(model.busy)} onClick={() => onAction({ type: "cart-save", value: group.id })}><Save size={15} />{model.busy === group.id ? "Guardando…" : "Guardar"}</button></div>
            {expanded.includes(group.id) && <ul id={`cart-store-${group.id}`}>{group.items.map(item => <li key={item.key}><span className="transfer-cart-product-icon"><Package size={18} /></span><div className="transfer-cart-product"><strong>{item.product}</strong><small>{item.code || item.productId}{item.size && item.size !== "Sin talla" ? ` · Talla ${item.size}` : ""}</small><span>{item.sourceName}<ArrowRight size={12} aria-hidden="true" />{group.name}</span></div><label className="transfer-cart-units"><span>Cantidad</span><input type="number" min={1} max={item.maximum} step={1} value={item.quantity} disabled={Boolean(model.busy)}
              aria-label={`Cantidad de ${item.product} desde ${item.sourceName} a ${group.name}`} aria-describedby={`cart-max-${item.key}`}
              onChange={event => onAction({ type: "cart-quantity", value: JSON.stringify([item.key, event.target.value]) })} /><small id={`cart-max-${item.key}`}>Máx. {item.maximum} und</small></label><button type="button" className="transfer-cart-icon-button is-remove" disabled={Boolean(model.busy)} aria-label={`Quitar ${item.product} de ${group.name}`} onClick={() => onAction({ type: "cart-remove", value: item.key })}><Trash2 size={16} /></button></li>)}</ul>}
          </section>)}
      </div>
      <footer className="transfer-cart-footer"><p>{saved ? "La guía se aplica a todos los productos del grupo validado." : "Guarda cada grupo para enviarlo a validación."}</p><div>{!saved && model.count > 0 && <button type="button" className="transfer-cart-clear" disabled={Boolean(model.busy)} onClick={() => onAction({ type: "cart-clear" })}>Vaciar selección</button>}<button type="button" className="transfer-cart-primary" onClick={close}>Seguir seleccionando</button></div></footer>
    </section>
  </div>;
}
