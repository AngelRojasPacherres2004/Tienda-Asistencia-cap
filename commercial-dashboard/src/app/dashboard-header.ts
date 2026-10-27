import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { readRuntimeConfig, type ReactHeaderBridge } from './runtime-config';

export type DashboardHeaderModel = {
  title: string;
  cutoffDate: string;
  version: string;
  storeSummary: { total: number; metro: number; outside: number } | null;
  showLogout: boolean;
  userName: string;
};

@Component({
  selector: 'dashboard-header',
  standalone: true,
  template: `
    @if (reactEnabled) {
      <div #reactHost></div>
    } @else {
      <header class="brand-header">
        <div class="brand-block"><img src="/comercial/logo-almacen-remates.png" alt="Almacén de Remates" />
          @if (model.storeSummary; as summary) { <p class="store-summary"><strong>{{ summary.total }} TIENDAS</strong><span>{{ summary.metro }} METRO</span><span>{{ summary.outside }} NO METRO</span></p> }
        </div>
        <div><h1>{{ model.title }}</h1></div>
        <div class="header-actions">
          <div class="cutoff"><span>CORTE COMERCIAL</span><strong>{{ model.cutoffDate }}</strong><small>{{ model.version }}</small></div>
          @if (model.showLogout) { <button type="button" class="logout" (click)="logout.emit()" [title]="model.userName">SALIR</button> }
        </div>
      </header>
    }
  `,
  styles: [':host,:host > div{display:contents}'],
})
export class DashboardHeaderComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) model: DashboardHeaderModel = {
    title: '', cutoffDate: '', version: '', storeSummary: null, showLogout: false, userName: '',
  };
  @Output() logout = new EventEmitter<void>();
  @ViewChild('reactHost') reactHost?: ElementRef<HTMLDivElement>;
  readonly reactEnabled = readRuntimeConfig().reactModules?.includes('header')
    && typeof window !== 'undefined' && typeof window.mountReactCommercialHeader === 'function';
  private bridge?: ReactHeaderBridge;

  ngAfterViewInit(): void {
    if (!this.reactEnabled || !this.reactHost || !window.mountReactCommercialHeader) return;
    this.bridge = window.mountReactCommercialHeader(this.reactHost.nativeElement, () => this.logout.emit());
    this.bridge.update(this.model);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['model']) this.bridge?.update(this.model);
  }

  ngOnDestroy(): void {
    this.bridge?.dispose();
  }
}
