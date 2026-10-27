import React from "react";
import { createRoot } from "react-dom/client";
import CommercialReactPrimaryKpis from "./CommercialReactPrimaryKpis";
import CommercialReactKeyKpis from "./CommercialReactKeyKpis";
import CommercialReactProgress from "./CommercialReactProgress";
import CommercialReactTalentKpis from "./CommercialReactTalentKpis";
import CommercialReactSizeControls from "./CommercialReactSizeControls";
import CommercialReactTalentCapacity from "./CommercialReactTalentCapacity";
import CommercialReactStockMatrix from "./CommercialReactStockMatrix";

const MODULES = { "primary-kpis": CommercialReactPrimaryKpis, "key-kpis": CommercialReactKeyKpis, progress: CommercialReactProgress, "talent-kpis": CommercialReactTalentKpis, "size-controls": CommercialReactSizeControls, "talent-capacity": CommercialReactTalentCapacity, "stock-matrix": CommercialReactStockMatrix };

export function mountReactCommercialModule(host, moduleId, onAction) {
  const root = createRoot(host);
  const Component = MODULES[moduleId];
  if (!Component) throw new Error(`Módulo React desconocido: ${moduleId}`);
  return {
    update(model) { root.render(<Component model={model} onAction={onAction} />); },
    dispose() { root.unmount(); },
  };
}
