import { createRoot } from "react-dom/client";
import CommercialReactHeader from "./CommercialReactHeader";

export function mountReactCommercialHeader(host, onLogout) {
  const root = createRoot(host);
  return {
    update(model) { root.render(<CommercialReactHeader model={model} onLogout={onLogout} />); },
    dispose() { root.unmount(); },
  };
}
