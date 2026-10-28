import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { readRuntimeConfig, type ReactTabsBridge } from './runtime-config';

type Page = 1 | 2 | 3;

@Component({
  selector: 'dashboard-tabs',
  standalone: true,
  template: `
    @if (reactEnabled) {
      <div #reactHost></div>
    } @else {
      <nav class="page-tabs" aria-label="Páginas del dashboard">
        <button type="button" [class.active]="page === 1" (click)="navigate.emit(1)"><span>01</span> GESTIÓN COMERCIAL</button>
        <button type="button" [class.active]="page === 2" (click)="navigate.emit(2)"><span>02</span> INVENTARIO Y PREDICTIVO</button>
        <button type="button" [class.active]="page === 3" (click)="navigate.emit(3)"><span>03</span> GESTIÓN DE TALENTO</button>
      </nav>
    }
  `,
  styles: [':host,:host > div{display:contents}'],
})
export class DashboardTabsComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) page: Page = 1;
  @Output() navigate = new EventEmitter<Page>();
  @ViewChild('reactHost') reactHost?: ElementRef<HTMLDivElement>;
  readonly reactEnabled = readRuntimeConfig().reactModules?.includes('page-tabs')
    && typeof window !== 'undefined' && typeof window.mountReactCommercialTabs === 'function';
  private bridge?: ReactTabsBridge;

  ngAfterViewInit(): void {
    if (!this.reactEnabled || !this.reactHost || !window.mountReactCommercialTabs) return;
    this.bridge = window.mountReactCommercialTabs(this.reactHost.nativeElement, page => this.navigate.emit(page));
    this.bridge.update(this.page);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['page']) this.bridge?.update(this.page);
  }

  ngOnDestroy(): void {
    this.bridge?.dispose();
  }
}
