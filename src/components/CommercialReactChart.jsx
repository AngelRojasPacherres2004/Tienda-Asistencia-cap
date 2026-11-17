import { viewportTooltipPosition } from "../commercial/tooltip-position";
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
  const baseChartOption = useMemo(() => metric ? metric.kind === 'gauge' ? singleBarGauge(metric, option.tooltip) : singleBarRadial(metric, option.tooltip) : readable ? readableChartTypography(option, '', readable === 'manager' ? 13 : 0) : option, [readable, option, metric]);
  const host = useRef(null);
  const chart = useRef(null);
  const chartOption = useMemo(() => {
    if (!['inventory-antiquity', 'inventory-sizes'].includes(chartId) || !baseChartOption?.tooltip) return baseChartOption;
    const tooltip = baseChartOption.tooltip;
    return { ...baseChartOption, tooltip: {
      ...tooltip,
      confine: false,
      appendTo: () => document.body,
      padding: [10, 14],
      extraCssText: 'box-sizing:border-box;max-width:calc(100vw - 24px);white-space:normal;z-index:10000;',
      position: (point, _params, _element, _rect, size) => viewportTooltipPosition(point, size.contentSize, host.current.getBoundingClientRect(), [window.innerWidth, window.innerHeight]),
      formatter: (...args) => {
        const html = typeof tooltip.formatter === 'function' ? tooltip.formatter(...args) : '';
        return typeof html === 'string' ? html.replaceAll('width:min(360px,calc(100% - 16px),calc(100vw - 24px))', 'width:min(420px,calc(100vw - 52px))') : html;
      },
    } };
  }, [baseChartOption, chartId]);
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
    style={{ boxSizing: "border-box", display: "block", width: "100%", height: "100%", minHeight: chartId === 'inventory-store-value' ? 0 : 180 }} />;
}
