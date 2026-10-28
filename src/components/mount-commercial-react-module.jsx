import React from "react";
import { createRoot } from "react-dom/client";
import CommercialReactPrimaryKpis from "./CommercialReactPrimaryKpis";
import CommercialReactKeyKpis from "./CommercialReactKeyKpis";
import CommercialReactProgress from "./CommercialReactProgress";
import CommercialReactTalentKpis from "./CommercialReactTalentKpis";
import CommercialReactSizeControls from "./CommercialReactSizeControls";
import CommercialReactTalentCapacity from "./CommercialReactTalentCapacity";
import CommercialReactStockMatrix from "./CommercialReactStockMatrix";
import CommercialReactBirthdayModal from "./CommercialReactBirthdayModal";
import CommercialReactGrowthCard from "./CommercialReactGrowthCard";
import CommercialReactSimpleChartCard from "./CommercialReactSimpleChartCard";
import CommercialReactTrainingCard from "./CommercialReactTrainingCard";
import CommercialReactSizeCard from "./CommercialReactSizeCard";
import CommercialReactStoreValueCard from "./CommercialReactStoreValueCard";
import CommercialReactCategoryCard from "./CommercialReactCategoryCard";
import CommercialReactBrandCard from "./CommercialReactBrandCard";
import CommercialReactRankingCard from "./CommercialReactRankingCard";
import CommercialReactGenderCard from "./CommercialReactGenderCard";
import CommercialReactPriceRangeCard from "./CommercialReactPriceRangeCard";
import CommercialReactRotationCard from "./CommercialReactRotationCard";
import CommercialReactAntiquityCard from "./CommercialReactAntiquityCard";
import CommercialReactHealthCard from "./CommercialReactHealthCard";
import CommercialReactProjectionCard from "./CommercialReactProjectionCard";
import CommercialReactReplenishmentCard from "./CommercialReactReplenishmentCard";
import CommercialReactSellerCard from "./CommercialReactSellerCard";
import CommercialReactMonthlyModal from "./CommercialReactMonthlyModal";
import CommercialReactStockOriginModal from "./CommercialReactStockOriginModal";
import CommercialReactTransferModal from "./CommercialReactTransferModal";
import CommercialReactPredictiveParameters from "./CommercialReactPredictiveParameters";

const MODULES = { "primary-kpis": CommercialReactPrimaryKpis, "key-kpis": CommercialReactKeyKpis, progress: CommercialReactProgress, "talent-kpis": CommercialReactTalentKpis, "size-controls": CommercialReactSizeControls, "talent-capacity": CommercialReactTalentCapacity, "stock-matrix": CommercialReactStockMatrix, "birthday-modal": CommercialReactBirthdayModal, "growth-card": CommercialReactGrowthCard, "meta-vs-real-card": CommercialReactSimpleChartCard, "hourly-card": CommercialReactSimpleChartCard, "talent-history-card": CommercialReactSimpleChartCard, "talent-team-card": CommercialReactSimpleChartCard, "talent-area-card": CommercialReactSimpleChartCard, "talent-store-card": CommercialReactSimpleChartCard, "talent-exit-card": CommercialReactSimpleChartCard, "talent-incidents-card": CommercialReactSimpleChartCard, "talent-training-card": CommercialReactTrainingCard, "size-card": CommercialReactSizeCard, "store-value-card": CommercialReactStoreValueCard, "category-card": CommercialReactCategoryCard, "brand-card": CommercialReactBrandCard, "ranking-card": CommercialReactRankingCard, "gender-card": CommercialReactGenderCard, "price-range-card": CommercialReactPriceRangeCard, "rotation-card": CommercialReactRotationCard, "antiquity-card": CommercialReactAntiquityCard, "health-card": CommercialReactHealthCard, "projection-card": CommercialReactProjectionCard, "replenishment-card": CommercialReactReplenishmentCard, "seller-card": CommercialReactSellerCard, "ticket-modal": CommercialReactMonthlyModal, "conversion-modal": CommercialReactMonthlyModal, "traffic-modal": CommercialReactMonthlyModal, "stock-origin-modal": CommercialReactStockOriginModal, "transfer-modal": CommercialReactTransferModal, "predictive-parameters": CommercialReactPredictiveParameters };

export function mountReactCommercialModule(host, moduleId, onAction) {
  const root = createRoot(host);
  const Component = MODULES[moduleId];
  if (!Component) throw new Error(`Módulo React desconocido: ${moduleId}`);
  return {
    update(model) { root.render(<Component model={model} onAction={onAction} />); },
    dispose() { root.unmount(); },
  };
}
