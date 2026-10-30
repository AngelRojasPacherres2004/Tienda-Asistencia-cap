import { useContext, useEffect, useMemo, useRef } from "react";
import { CommercialChartTypography, readableChartTypography } from './commercialChartTypography';
import { SingleBarPresentation, singleBarMetric, singleBarGauge, singleBarRadial } from './singleBarPresentation';
import { BarChart, GaugeChart, LineChart, PieChart } from "echarts/charts";
import { DataZoomComponent, GraphicComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { init, use as registerCharts } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

registerCharts([BarChart, GaugeChart, LineChart, PieChart, DataZoomComponent, GraphicComponent, GridComponent,
  LegendComponent, MarkLineComponent, TooltipComponent, CanvasRenderer]);

export default function CommercialReactChart({ chartId, label, onClick, option }) {
  const readable = useContext(CommercialChartTypography);
  const singleBarEnabled = useContext(SingleBarPresentation);
  const metric = useMemo(() => singleBarEnabled ? singleBarMetric(option, chartId) : null, [singleBarEnabled, option, chartId]);
  const chartOption = useMemo(() => metric ? metric.kind === 'gauge' ? singleBarGauge(metric, option.tooltip) : singleBarRadial(metric, option.tooltip) : readable ? readableChartTypography(option) : option, [readable, option, metric]);
  const host = useRef(null);
  const chart = useRef(null);
  const clickHandler = useRef(onClick);
  clickHandler.current = onClick;

  useEffect(() => {
    const instance = init(host.current, undefined, { renderer: "canvas" });
    chart.current = instance;
    const handleClick = params => clickHandler.current?.(params.data?.sourceData ?? params.data);
    instance.on("click", handleClick);
    const observer = new ResizeObserver(() => instance.resize({ animation: { duration: 0 } }));
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      instance.off("click", handleClick);
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartOption && chart.current) chart.current.setOption(chartOption, { notMerge: true, lazyUpdate: true });
  }, [chartOption]);

  return <div ref={host} data-react-commercial-chart={chartId} data-chart-presentation={metric ? metric.kind === 'gauge' ? 'gauge' : 'radial' : 'original'} role="img" aria-label={label}
    onMouseMove={metric?.rotation || metric?.inventory ? event => { const bounds = event.currentTarget.getBoundingClientRect(); chart.current?.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: 0, position: [event.clientX - bounds.left + 12, event.clientY - bounds.top + 12] }); } : undefined}
    onMouseLeave={metric?.rotation || metric?.inventory ? () => chart.current?.dispatchAction({ type: 'hideTip' }) : undefined}
    style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: 180 }} />;
}
