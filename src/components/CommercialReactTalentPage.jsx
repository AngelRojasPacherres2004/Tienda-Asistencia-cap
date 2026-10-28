import React from "react";
import CommercialReactSectionHeading from "./CommercialReactSectionHeading";
import CommercialReactTalentKpis from "./CommercialReactTalentKpis";
import CommercialReactTalentCapacity from "./CommercialReactTalentCapacity";
import CommercialReactSimpleChartCard from "./CommercialReactSimpleChartCard";
import CommercialReactSellerCard from "./CommercialReactSellerCard";
import CommercialReactTrainingCard from "./CommercialReactTrainingCard";

export default function CommercialReactTalentPage({ model, onAction }) {
  const sectionAction = action => onAction({ ...action, source: "section" });
  const kpiAction = action => onAction({ ...action, source: "kpis" });
  const sellerAction = action => onAction({ ...action, source: "seller" });
  const trainingAction = action => onAction({ ...action, source: "training" });
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
      <CommercialReactSimpleChartCard model={model.area} />
      <CommercialReactSimpleChartCard model={model.store} />
    </div>
    <CommercialReactSectionHeading model={model.headings.c} onAction={sectionAction} />
    <div className="talent-development-grid">
      <CommercialReactTrainingCard model={model.training} onAction={trainingAction} />
      <CommercialReactSimpleChartCard model={model.exit} />
      <CommercialReactSimpleChartCard model={model.incidents} />
    </div>
  </section>;
}
