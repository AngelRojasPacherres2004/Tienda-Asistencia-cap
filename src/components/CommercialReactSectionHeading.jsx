import React from "react";

export default function CommercialReactSectionHeading({ model, onAction }) {
  if (model.kind === "page") return <div className="section-heading" data-react-commercial-module="section-heading"><span>{model.mark}</span><div><h2>{model.title}</h2></div></div>;
  return <>
    <div className={`block-heading${model.predictive ? " predictive-block-title" : ""}`} data-react-commercial-module="section-heading">
      <span>{model.mark}</span><h2>{model.title}</h2>
      {model.transferVisible && <button type="button" className="retry-button" onClick={() => onAction({ type: "transfers" })}>VER TRASLADOS ENTRE TIENDAS</button>}
      <button type="button" className="section-advice-btn" hidden={!model.adviceEnabled} onClick={() => onAction({ type: "advice", value: model.id })} title="Pedir consejo a Groq" aria-label="Pedir consejo a Groq">✦</button>
    </div>
    {model.adviceEnabled && model.advice && (model.predictive
      ? <div className="predictive-advice-row"><p className={`section-advice${model.advice.error ? " error" : ""}`}>{model.advice.loading ? "Generando consejo…" : model.advice.text}</p></div>
      : <p className={`section-advice${model.advice.error ? " error" : ""}`}>{model.advice.loading ? "Generando consejo…" : model.advice.text}</p>)}
  </>;
}
