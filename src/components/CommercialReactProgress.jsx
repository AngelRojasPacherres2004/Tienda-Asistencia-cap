import React from "react";

function Summary({ title, rows, tooltip }) {
  return <article className="card summary-card" title={tooltip}>
    <h2>{title}</h2><dl>{rows.map(row => <div key={row.label}><dt title={row.title || undefined}>{row.label}</dt><dd className={row.valueClass || undefined}>{row.value}</dd></div>)}</dl>
  </article>;
}

export default function CommercialReactProgress({ model }) {
  return <div className="executive-grid" data-react-commercial-module="progress">
    <article className="card progress-card annual" title="Fórmula: avance acumulado = venta neta de los meses transcurridos ÷ meta anual × 100. El filtro de día no modifica este avance oficial.">
      <h2><svg><use href="/comercial/assets/icons.svg#target" /></svg> AVANCE ACUMULADO</h2>
      <div className="split-meter"><div className="meter-actual" style={{ flexGrow: model.annual.actualGrow }}><strong>{model.annual.actualPct}</strong><span>{model.annual.actualValue}</span></div><div className="meter-remaining" style={{ flexGrow: model.annual.remainingGrow }}><strong>{model.annual.remainingPct}</strong><span>{model.annual.remainingValue}</span></div></div>
    </article>
    <article className="card progress-card accumulated" title="Fórmula: avance mensual = venta neta del mes seleccionado ÷ meta del mismo mes × 100.">
      <h2><svg><use href="/comercial/assets/icons.svg#gauge" /></svg> AVANCE MENSUAL · {model.monthlyContext}</h2>
      <div className="split-meter accumulated-meter"><div className="meter-actual" style={{ flexGrow: model.monthly.actualGrow }}><strong>{model.monthly.actualPct}</strong><span>{model.monthly.actualValue}</span></div><div className="meter-gap" style={{ flexGrow: model.monthly.remainingGrow }}><strong>{model.monthly.remainingPct}</strong><span>{model.monthly.remainingValue}</span></div></div>
    </article>
    <Summary title="AVANCE ANUAL" tooltip="Meta anual = suma de metas mensuales; cumplimiento = venta neta ÷ meta anual × 100; variación interanual = venta actual ÷ venta comparable anterior − 1." rows={model.annualRows} />
    <Summary title="AVANCE MENSUAL" tooltip="Meta mensual = suma de metas del período; cumplimiento = venta neta del período ÷ meta del período × 100; variación mensual = venta actual ÷ venta del mes anterior − 1." rows={model.monthlyRows} />
  </div>;
}
