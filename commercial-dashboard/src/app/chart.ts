import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { init, use } from 'echarts/core';
import type { ECharts, EChartsOption } from 'echarts';
import { CanvasRenderer } from 'echarts/renderers';

use([BarChart, LineChart, PieChart, DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, CanvasRenderer]);

@Component({
  selector: 'dashboard-chart',
  standalone: true,
  template: '<div #host class="chart-host" role="img" [attr.aria-label]="label"></div>',
  styles: [':host,.chart-host{display:block;width:100%;height:100%;min-height:180px}'],
})
export class DashboardChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) option!: EChartsOption;
  @Input() label = 'Gráfico del dashboard';
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;
  private chart?: ECharts;
  private observer?: ResizeObserver;
  private renderFrame = 0;
  private resizeFrame = 0;

  ngAfterViewInit(): void {
    this.chart = init(this.host.nativeElement, undefined, { renderer: 'canvas' });
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
    this.observer?.disconnect();
    if (this.renderFrame) cancelAnimationFrame(this.renderFrame);
    if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
    this.chart?.dispose();
  }

  private scheduleRender(): void {
    if (!this.chart || !this.option) return;
    if (this.renderFrame) cancelAnimationFrame(this.renderFrame);
    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = 0;
      if (!this.chart || !this.option) return;
      // Un solo render por frame y reemplazo atómico. Evita que ECharts mezcle
      // ejes nuevos con series anteriores durante cambios rápidos de filtros/página.
      this.chart.setOption(this.option, {
        notMerge: true,
        lazyUpdate: true,
      });
    });
  }
}
