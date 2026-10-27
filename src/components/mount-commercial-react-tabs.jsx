import { createRoot } from "react-dom/client";
import CommercialReactTabs from "./CommercialReactTabs";

export function mountReactCommercialTabs(host, onNavigate) {
  const root = createRoot(host);
  return {
    update(page) { root.render(<CommercialReactTabs page={page} onNavigate={onNavigate} />); },
    dispose() { root.unmount(); },
  };
}
