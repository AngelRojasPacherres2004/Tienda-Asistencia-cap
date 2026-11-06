import React, { useEffect, useState } from "react";
import { Store, Save, Check, ChevronDown, Package, ArrowRight } from "lucide-react";

function SavedGroup({ group, canValidate, busy, onAction }) {
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState(group.guide);
  useEffect(() => setGuide(group.guide), [group.guide]);
  const validated = group.status === "validado";
  return <section className="transfer-cart-group" data-transfer-group-id={group.id} aria-label={`Guardado para ${group.name}`}>
    <div className="transfer-cart-group-header"><button type="button" className="transfer-cart-group-toggle" aria-expanded={open} aria-controls={`saved-transfer-${group.id}`} onClick={() => setOpen(value => !value)}>
      <span className="transfer-cart-destination"><Store size={18} /><span><strong>{group.name}</strong><small className={`transfer-group-status ${group.status}`}>{validated ? "Validado" : "Pendiente de validación"} · {new Date(group.createdAt).toLocaleDateString("es-PE")}</small></span></span>
      <span className="transfer-cart-destination-total"><strong>{group.quantity} und</strong><ChevronDown size={17} className={open ? "is-open" : ""} /></span></button>
      <div className="transfer-saved-actions">{!validated && canValidate && <button type="button" className="transfer-group-save" disabled={Boolean(busy)} onClick={() => onAction({ type: "cart-validate", value: group.id })}><Check size={15} />{busy === group.id ? "Validando…" : "Validar"}</button>}
        <div className="transfer-guide-editor"><label><span>Número de guía</span><input value={guide} maxLength={80} disabled={!validated || Boolean(busy)} placeholder={validated ? "Sin guía" : "Después de validar"}
          aria-label={`Número de guía para ${group.name}`} onChange={event => setGuide(event.target.value)} /></label>
          <button type="button" className="transfer-cart-icon-button" disabled={!validated || Boolean(busy) || guide.trim() === group.guide} aria-label={`Guardar guía para ${group.name}`} title="Guardar guía en todos los productos del grupo"
            onClick={() => onAction({ type: "cart-guide", value: JSON.stringify([group.id, guide]) })}><Save size={16} /></button></div>
      </div>
    </div>
    {open && <ul id={`saved-transfer-${group.id}`}>{group.items.map(item => <li key={item.id}><span className="transfer-cart-product-icon"><Package size={18} /></span><div className="transfer-cart-product"><strong>{item.product}</strong><small>{item.code || item.productId}{item.size ? ` · Talla ${item.size}` : ""}</small><span>{item.sourceName}<ArrowRight size={12} />{group.name}</span></div><span className="transfer-cart-units"><strong>{item.quantity}</strong><small>und guardadas</small></span></li>)}</ul>}
  </section>;
}

export default function CommercialSavedTransferGroups({ model, onAction }) {
  if (model.savedLoading) return <div className="transfer-cart-empty" role="status"><span className="loader" /><p>Consultando grupos guardados…</p></div>;
  if (!model.savedGroups?.length) return <div className="transfer-cart-empty"><Package size={38} /><h3>Aún no hay grupos guardados</h3><p>Guarda una selección para enviarla a validación.</p></div>;
  return model.savedGroups.map(group => <SavedGroup key={group.id} group={group} canValidate={model.canValidate} busy={model.busy} onAction={onAction} />);
}
