import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { DataZoomComponent, GraphicComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { init, use } from 'echarts/core';
import type { ECharts, EChartsOption } from 'echarts';
import { CanvasRenderer } from 'echarts/renderers';
import { viewportTooltipPosition } from './tooltip-position';
import { readRuntimeConfig, type ReactChartBridge } from './runtime-config';
import { blackChartText } from './chart-text';

export { blackChartText } from './chart-text';

use([BarChart, LineChart, PieChart, DataZoomComponent, GraphicComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, CanvasRenderer]);

@Component({
  selector: 'dashboard-chart',
  standalone: true,
  template: '<div #host class="chart-host" role="img" [attr.aria-label]="label"></div>',
  styles: [':host,.chart-host{box-sizing:border-box;display:block;width:100%;max-width:100%;min-width:0;height:100%;min-height:180px;overflow:hidden}'],
})
export class DashboardChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) option!: EChartsOption;
  @Input() label = 'Gráfico del dashboard';
  @Input() chartId = '';
  @Input() viewportTooltip = false;
  @Output() itemClick = new EventEmitter<{ data: unknown }>();
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;
  private chart?: ECharts;
  private reactChart?: ReactChartBridge;
  private observer?: ResizeObserver;
  private renderFrame = 0;
  private resizeFrame = 0;
  private tooltipScrollRoot?: Node;
  private readonly hideTooltipOnScroll = (event: Event) => {
    const target = event.target;
    if (target === document || (target instanceof Element && target.contains(this.host.nativeElement))) {
      this.chart?.dispatchAction({ type: 'hideTip' });
    }
  };

  ngAfterViewInit(): void {
    if (this.chartId && readRuntimeConfig().reactCharts?.includes(this.chartId)
      && window.mountReactCommercialChart) {
      this.reactChart = window.mountReactCommercialChart(this.host.nativeElement,
        this.chartId, this.label, data => this.itemClick.emit({ data }));
      this.scheduleRender();
      return;
    }
    this.chart = init(this.host.nativeElement, undefined, { renderer: 'canvas' });
    if (this.viewportTooltip) {
      this.tooltipScrollRoot = this.host.nativeElement.getRootNode();
      this.tooltipScrollRoot.addEventListener('scroll', this.hideTooltipOnScroll, true);
      if (this.tooltipScrollRoot !== document) document.addEventListener('scroll', this.hideTooltipOnScroll, true);
    }
    this.chart.on('click', params => this.itemClick.emit({ data: params.data }));
    this.scheduleRender();
    this.observer = new ResizeObserver(() => {
      if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = 0;
        this.chart?.resize({ animation: { duration: 0 } });
      });
    });
    this.observer.observe(this.host.nativeElement);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['option']) this.scheduleRender();
  }

  ngOnDestroy(): void {
    this.tooltipScrollRoot?.removeEventListener('scroll', this.hideTooltipOnScroll, true);
    document.removeEventListener('scroll', this.hideTooltipOnScroll, true);
    this.observer?.disconnect();
    if (this.renderFrame) cancelAnimationFrame(this.renderFrame);
    if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
    this.chart?.dispose();
    this.reactChart?.dispose();
  }

  private scheduleRender(): void {
    if ((!this.chart && !this.reactChart) || !this.option) return;
    if (this.renderFrame) cancelAnimationFrame(this.renderFrame);
    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = 0;
      if ((!this.chart && !this.reactChart) || !this.option) return;
      // Un solo render por frame y reemplazo atómico. Evita que ECharts mezcle
      // ejes nuevos con series anteriores durante cambios rápidos de filtros/página.
      const option = blackChartText(this.option);
      if (this.viewportTooltip && option.tooltip && !Array.isArray(option.tooltip)) {
        option.tooltip = {
          ...option.tooltip, appendTo: document.body, confine: false, enterable: true,
          transitionDuration: 0, padding: [12, 14],
          extraCssText: 'z-index:10000;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto;box-sizing:border-box;white-space:normal;',
          position: (point, _params, _element, _rect, size) => viewportTooltipPosition(
            point, size.contentSize, this.host.nativeElement.getBoundingClientRect(),
            [document.documentElement.clientWidth, document.documentElement.clientHeight],
          ),
        };
      }
      if (this.reactChart) {
        this.reactChart.update(option);
        return;
      }
      this.chart!.setOption(option, {
        notMerge: true,
        lazyUpdate: true,
      });
    });
  }
}
