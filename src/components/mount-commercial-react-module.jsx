import React from "react";
import { createRoot } from "react-dom/client";
import CommercialReactPrimaryKpis from "./CommercialReactPrimaryKpis";
import CommercialReactKeyKpis from "./CommercialReactKeyKpis";
import CommercialReactProgress from "./CommercialReactProgress";

const MODULES = { "primary-kpis": CommercialReactPrimaryKpis, "key-kpis": CommercialReactKeyKpis, progress: CommercialReactProgress };

export function mountReactCommercialModule(host, moduleId, onAction) {
  const root = createRoot(host);
  const Component = MODULES[moduleId];
  if (!Component) throw new Error(`Módulo React desconocido: ${moduleId}`);
  return {
    update(model) { root.render(<Component model={model} onAction={onAction} />); },
    dispose() { root.unmount(); },
  };
}
