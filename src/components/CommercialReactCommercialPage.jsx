import React from "react";
import CommercialReactSectionHeading from "./CommercialReactSectionHeading";
import CommercialReactPrimaryKpis from "./CommercialReactPrimaryKpis";
import CommercialReactKeyKpis from "./CommercialReactKeyKpis";
import CommercialReactProgress from "./CommercialReactProgress";
import CommercialReactSimpleChartCard from "./CommercialReactSimpleChartCard";
import CommercialReactCategoryCard from "./CommercialReactCategoryCard";
import CommercialReactBrandCard from "./CommercialReactBrandCard";
import CommercialReactRankingCard from "./CommercialReactRankingCard";
import CommercialReactGenderCard from "./CommercialReactGenderCard";
import CommercialReactGrowthCard from "./CommercialReactGrowthCard";
import CommercialReactPriceRangeCard from "./CommercialReactPriceRangeCard";

export default function CommercialReactCommercialPage({ model, onAction }) {
  const forward = source => action => onAction({ ...action, source });
  return <section className="page page-one" aria-label="Gestión y comercial" data-react-commercial-module="commercial-page">
    <CommercialReactSectionHeading model={model.headings.commercial} onAction={forward("section")} />
    <CommercialReactPrimaryKpis model={model.primary} />
    <CommercialReactSectionHeading model={model.headings.a} onAction={forward("section")} />
    <CommercialReactKeyKpis model={model.key} onAction={forward("key")} />
    <CommercialReactSectionHeading model={model.headings.b} onAction={forward("section")} />
    <CommercialReactProgress model={model.progress} />
    <CommercialReactSectionHeading model={model.headings.c} onAction={forward("section")} />
    <div className="charts-four">
      <CommercialReactSimpleChartCard model={model.meta} />
      <CommercialReactCategoryCard model={model.category} onAction={forward("category")} />
      <CommercialReactBrandCard model={model.brand} onAction={forward("brand")} />
    </div>
    <div className="hourly-insight-grid">
      <CommercialReactSimpleChartCard model={model.hourly} />
      <CommercialReactRankingCard model={model.ranking} onAction={forward("ranking")} />
    </div>
    <CommercialReactSectionHeading model={model.headings.d} onAction={forward("section")} />
    <div className="static-charts">
      <CommercialReactGenderCard model={model.gender} onAction={forward("gender")} />
      <CommercialReactGrowthCard model={model.growth} />
      <CommercialReactPriceRangeCard model={model.price} onAction={forward("price")} />
    </div>
  </section>;
}
