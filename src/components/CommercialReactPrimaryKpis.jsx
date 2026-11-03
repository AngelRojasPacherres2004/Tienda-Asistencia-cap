import React from "react";

export default function CommercialReactPrimaryKpis({ model, onAction }) {
  return <div className="flow-growth-row primary-kpis" aria-label="Indicadores comerciales principales" data-react-commercial-module="primary-kpis">
    <div className="flow-row" aria-label="Composición de venta neta">
      {model.cards.map((card, index) => <React.Fragment key={card.label}>
        <article className={`metric-card${card.className ? ` ${card.className}` : ""}`} title={card.title}
          role={card.action ? "button" : undefined} tabIndex={card.action ? 0 : undefined}
          onClick={() => card.action && onAction({ type: card.action })}
          onKeyDown={event => card.action && (event.key === "Enter" || event.key === " ") && onAction({ type: card.action })}>
          <span>{card.label}</span><strong className={card.valueClass || undefined}>{card.value}</strong>
        </article>
        {index < 5 && <span className="operator">→</span>}
      </React.Fragment>)}
    </div>
  </div>;
}
