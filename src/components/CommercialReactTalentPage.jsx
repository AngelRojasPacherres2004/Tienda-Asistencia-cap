import React from "react";
import CommercialReactSectionHeading from "./CommercialReactSectionHeading";
import CommercialReactTalentKpis from "./CommercialReactTalentKpis";
import CommercialReactTalentCapacity from "./CommercialReactTalentCapacity";
import CommercialReactSimpleChartCard from "./CommercialReactSimpleChartCard";
import CommercialReactSellerCard from "./CommercialReactSellerCard";
import CommercialReactTrainingCard from "./CommercialReactTrainingCard";

export default function CommercialReactTalentPage({ model, onAction, storeAdmin = false }) {
  const sectionAction = action => onAction({ ...action, source: "section" });
  const kpiAction = action => onAction({ ...action, source: "kpis" });
  const sellerAction = action => onAction({ ...action, source: "seller" });
  const trainingAction = action => onAction({ ...action, source: "training" });
  if (storeAdmin) {
    const heading = (mark, title, page = false) => <CommercialReactSectionHeading model={{ kind: page ? 'page' : 'block', mark, title, adviceEnabled: false }} onAction={sectionAction} />;
    return <section className="page talent-page store-talent-page" aria-label="Operación y equipo" data-react-commercial-module="talent-page">
      {heading('03', 'OPERACIÓN Y EQUIPO', true)}
      <CommercialReactTalentKpis model={model.kpis} onAction={kpiAction} />
      {heading('A', 'DEMANDA Y PLANIFICACIÓN')}
      <slot name="store-demand" />
      {heading('B', 'DOTACIÓN Y PRODUCTIVIDAD')}
      <div className="talent-overview-grid talent-performance-grid"><CommercialReactTalentCapacity model={model.capacity} /><CommercialReactSimpleChartCard model={model.history} /><CommercialReactSimpleChartCard model={model.team} /><CommercialReactSellerCard model={model.seller} onAction={sellerAction} /><CommercialReactSimpleChartCard model={model.traffic} /><CommercialReactSimpleChartCard model={model.store} /></div>
      {heading('C', 'ASISTENCIA, CONTINUIDAD Y SEGUIMIENTO')}
      <slot name="store-attendance" />
      {heading('D', 'FORMACIÓN Y DESARROLLO')}
      <div className="talent-development-grid store-talent-development"><CommercialReactTrainingCard model={model.training} onAction={trainingAction} /><CommercialReactSimpleChartCard model={model.exit} /></div>
      <slot name="store-training" />
    </section>;
  }
  return <section className="page talent-page" aria-label="Talento y tiendas"
    data-operational-summary-ready={model.operationalSummaryReady ? "true" : undefined}
    data-react-commercial-module="talent-page">
    <CommercialReactSectionHeading model={model.headings.talent} onAction={sectionAction} />
    <CommercialReactTalentKpis model={model.kpis} onAction={kpiAction} />
    <CommercialReactSectionHeading model={model.headings.a} onAction={sectionAction} />
    <div className="talent-overview-grid">
      <CommercialReactTalentCapacity model={model.capacity} />
      <CommercialReactSimpleChartCard model={model.history} />
      <CommercialReactSimpleChartCard model={model.team} />
    </div>
    <CommercialReactSectionHeading model={model.headings.b} onAction={sectionAction} />
    <div className="talent-performance-grid">
      <CommercialReactSellerCard model={model.seller} onAction={sellerAction} />
      <CommercialReactSimpleChartCard model={model.traffic} />
      <CommercialReactSimpleChartCard model={model.store} />
    </div>
    <slot name="commercial-traffic" />
    <CommercialReactSectionHeading model={model.headings.c} onAction={sectionAction} />
    <div className="talent-development-grid">
      <CommercialReactTrainingCard model={model.training} onAction={trainingAction} />
      <CommercialReactSimpleChartCard model={model.exit} />
      <CommercialReactSimpleChartCard model={model.incidents} />
    </div>
  </section>;
}
