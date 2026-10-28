import { createRoot } from "react-dom/client";
import CommercialReactFilters from "./CommercialReactFilters";

export function mountReactCommercialFilters(host, onAction) {
  const root = createRoot(host);
  return {
    update(model) { root.render(<CommercialReactFilters model={model} onAction={onAction} />); },
    dispose() { root.unmount(); },
  };
}
