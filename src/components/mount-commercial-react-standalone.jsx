import React from "react";
import { createRoot } from "react-dom/client";
import CommercialReactStandalone from "./CommercialReactStandalone";
import appStyles from "../../commercial-dashboard/src/app/app.scss?raw";
import transferModalStyles from "../../commercial-dashboard/src/app/transfer-modal.scss?raw";

export function mountReactCommercialStandalone(shadow, controller) {
  const styles = document.createElement("style");
  styles.textContent = `${appStyles}\n${transferModalStyles}`;
  shadow.append(styles);
  const host = document.createElement("div");
  host.style.display = "contents";
  shadow.append(host);
  const root = createRoot(host);
  return {
    update(model) { root.render(<CommercialReactStandalone model={model} controller={controller} />); },
    dispose() { root.unmount(); host.remove(); styles.remove(); },
  };
}
