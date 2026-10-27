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

const MODULES = { "primary-kpis": CommercialReactPrimaryKpis, "key-kpis": CommercialReactKeyKpis, progress: CommercialReactProgress, "talent-kpis": CommercialReactTalentKpis, "size-controls": CommercialReactSizeControls, "talent-capacity": CommercialReactTalentCapacity, "stock-matrix": CommercialReactStockMatrix, "birthday-modal": CommercialReactBirthdayModal, "growth-card": CommercialReactGrowthCard, "meta-vs-real-card": CommercialReactSimpleChartCard, "hourly-card": CommercialReactSimpleChartCard, "talent-history-card": CommercialReactSimpleChartCard, "talent-team-card": CommercialReactSimpleChartCard, "talent-area-card": CommercialReactSimpleChartCard, "talent-store-card": CommercialReactSimpleChartCard, "talent-exit-card": CommercialReactSimpleChartCard, "talent-incidents-card": CommercialReactSimpleChartCard, "talent-training-card": CommercialReactTrainingCard };

export function mountReactCommercialModule(host, moduleId, onAction) {
  const root = createRoot(host);
  const Component = MODULES[moduleId];
  if (!Component) throw new Error(`Módulo React desconocido: ${moduleId}`);
  return {
    update(model) { root.render(<Component model={model} onAction={onAction} />); },
    dispose() { root.unmount(); },
  };
}
