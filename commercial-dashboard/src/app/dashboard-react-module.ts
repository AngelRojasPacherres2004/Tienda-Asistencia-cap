import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { readRuntimeConfig, type ReactModuleBridge } from './runtime-config';

@Component({
  selector: 'dashboard-react-module',
  standalone: true,
  template: `
    <div [style.display]="reactEnabled ? 'none' : 'contents'"><ng-content /></div>
    @if (reactEnabled) { <div #reactHost></div> }
  `,
  styles: [':host,:host > div{display:contents}'],
})
export class DashboardReactModuleComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) moduleId = '';
  @Input({ required: true }) model: Record<string, unknown> = {};
  @Output() action = new EventEmitter<{ type: string; value?: string | number }>();
  @ViewChild('reactHost') reactHost?: ElementRef<HTMLDivElement>;
  private bridge?: ReactModuleBridge;

  get reactEnabled(): boolean {
    return !!readRuntimeConfig().reactModules?.includes(this.moduleId)
      && typeof window !== 'undefined' && typeof window.mountReactCommercialModule === 'function';
  }

  ngAfterViewInit(): void {
    if (!this.reactEnabled || !this.reactHost || !window.mountReactCommercialModule) return;
    this.bridge = window.mountReactCommercialModule(this.reactHost.nativeElement, this.moduleId, action => this.action.emit(action));
    this.bridge.update(this.model);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['model']) this.bridge?.update(this.model);
  }

  ngOnDestroy(): void {
    this.bridge?.dispose();
  }
}
