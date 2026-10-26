import { createRoot } from "react-dom/client";
import CommercialReactChart from "./CommercialReactChart";

export function mountReactCommercialChart(host, chartId, label, onClick) {
  const root = createRoot(host);
  return {
    update(option) { root.render(<CommercialReactChart chartId={chartId} label={label} onClick={onClick} option={option} />); },
    dispose() { root.unmount(); },
  };
}
