import React from "react";

function ActionCard({ card, onAction }) {
  const activate = () => onAction({ type: card.action });
  return <article className={card.className} role="button" tabIndex={0} aria-haspopup="dialog" title={card.title}
    onClick={activate} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } }}>
    <span>{card.label}</span><strong className={card.valueClass || undefined}>{card.value}</strong><small className="kpi-evolution-link">VER EVOLUCIÓN MENSUAL ↗</small>
  </article>;
}

export default function CommercialReactKeyKpis({ model, onAction }) {
  return <div className="kpi-strip" data-react-commercial-module="key-kpis">
    {model.actions.map(card => <ActionCard key={card.label} card={card} onAction={onAction} />)}
    <ActionCard card={{ label: "VENTA × M²", value: model.saleM2, action: "saleM2", title: "Venta neta ÷ (metraje físico de tiendas filtradas × 80%). Ver evolución mensual." }} onAction={onAction} />
    <ActionCard card={{ label: <>VENTA × COLAB <em>{model.personnel} COLAB.</em></>, className: "collaborator-kpi", value: model.saleCollaborator, valueClass: model.saleCollaboratorMissing ? "missing" : undefined, action: "saleCollaborator", title: "Venta neta ÷ colaboradores promedio. Ver evolución mensual y ranking de vendedores." }} onAction={onAction} />
    <ActionCard card={{ label: "MARKUP", value: model.markup, valueClass: model.markupPositive ? "positive" : "negative", action: "markup", title: "(Venta real positiva − venta bruta a precio sugerido) ÷ venta bruta a precio sugerido. Ver evolución mensual." }} onAction={onAction} />
    <ActionCard card={{ label: <>SELL-THROUGH{model.sellThroughStock && <em>{model.sellThroughStock}</em>}</>, value: model.sellThrough, valueClass: model.sellThroughMissing ? "missing" : undefined, action: "sellThrough", title: "Unidades vendidas ÷ (stock actual + unidades recibidas). Ver evolución mensual." }} onAction={onAction} />
  </div>;
}
