import { useEffect, useRef } from "react";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { DataZoomComponent, GraphicComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { init, use as registerCharts } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

registerCharts([BarChart, LineChart, PieChart, DataZoomComponent, GraphicComponent, GridComponent,
  LegendComponent, MarkLineComponent, TooltipComponent, CanvasRenderer]);

export default function CommercialReactChart({ chartId, label, onClick, option }) {
  const host = useRef(null);
  const chart = useRef(null);

  useEffect(() => {
    const instance = init(host.current, undefined, { renderer: "canvas" });
    chart.current = instance;
    const handleClick = params => onClick(params.data);
    instance.on("click", handleClick);
    const observer = new ResizeObserver(() => instance.resize({ animation: { duration: 0 } }));
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      instance.off("click", handleClick);
      instance.dispose();
      chart.current = null;
    };
  }, [onClick]);

  useEffect(() => {
    if (option && chart.current) chart.current.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  return <div ref={host} data-react-commercial-chart={chartId} role="img" aria-label={label}
    style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 180 }} />;
}
