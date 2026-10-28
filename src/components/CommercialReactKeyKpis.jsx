import React from "react";

function ActionCard({ card, onAction }) {
  const activate = () => onAction({ type: card.action });
  return <article className={card.className} role="button" tabIndex={0} aria-haspopup="dialog" title={card.title}
    onClick={activate} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } }}>
    <span>{card.label}</span><strong className={card.valueClass || undefined}>{card.value}</strong><small>VER EVOLUCIÓN MENSUAL ↗</small>
  </article>;
}

export default function CommercialReactKeyKpis({ model, onAction }) {
  return <div className="kpi-strip" data-react-commercial-module="key-kpis">
    {model.actions.map(card => <ActionCard key={card.label} card={card} onAction={onAction} />)}
    <article title="Fórmula: venta neta ÷ (Σ metraje físico de tiendas filtradas × 80%)."><span>VENTA × M²</span><strong>{model.saleM2}</strong></article>
    <article className="collaborator-kpi" title="Fórmula: venta neta del período ÷ colaboradores promedio del contexto filtrado."><span>VENTA × COLAB <em>{model.personnel} COLAB.</em></span><strong className={model.saleCollaboratorMissing ? "missing" : undefined}>{model.saleCollaborator}</strong></article>
    <article title="Fórmula: (venta real positiva − venta bruta a precio sugerido) ÷ venta bruta a precio sugerido × 100. No es margen contable."><span>MARKUP</span><strong className={model.markupPositive ? "positive" : "negative"}>{model.markup}</strong></article>
    <article title="Fórmula: unidades vendidas ÷ (stock actual + unidades recibidas) × 100."><span>SELL-THROUGH{model.sellThroughStock && <em>{model.sellThroughStock}</em>}</span><strong className={model.sellThroughMissing ? "missing" : undefined}>{model.sellThrough}</strong></article>
  </div>;
}
