import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { readRuntimeConfig, type ReactFiltersBridge } from './runtime-config';

export type DashboardFiltersModel = Record<string, unknown>;
export type DashboardFilterAction = { type: string; value?: string | number };

@Component({
  selector: 'dashboard-filters',
  standalone: true,
  template: `
    <div [style.display]="reactEnabled ? 'none' : 'contents'"><ng-content /></div>
    @if (reactEnabled) { <div #reactHost></div> }
  `,
  styles: [':host,:host > div{display:contents}'],
})
export class DashboardFiltersComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) model: DashboardFiltersModel = {};
  @Output() action = new EventEmitter<DashboardFilterAction>();
  @ViewChild('reactHost') reactHost?: ElementRef<HTMLDivElement>;
  readonly reactEnabled = readRuntimeConfig().reactModules?.includes('filters')
    && typeof window !== 'undefined' && typeof window.mountReactCommercialFilters === 'function';
  private bridge?: ReactFiltersBridge;

  ngAfterViewInit(): void {
    if (!this.reactEnabled || !this.reactHost || !window.mountReactCommercialFilters) return;
    this.bridge = window.mountReactCommercialFilters(this.reactHost.nativeElement, action => this.action.emit(action));
    this.bridge.update(this.model);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['model']) this.bridge?.update(this.model);
  }

  ngOnDestroy(): void {
    this.bridge?.dispose();
  }
}
