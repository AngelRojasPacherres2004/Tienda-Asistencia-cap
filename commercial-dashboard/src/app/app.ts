import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DashboardAssistantWidgetComponent } from './assistant-widget';
import { DashboardChartComponent } from './chart';
import { DashboardTabsComponent } from './dashboard-tabs';
import { DashboardHeaderComponent } from './dashboard-header';
import { DashboardFiltersComponent } from './dashboard-filters';
import { DashboardReactModuleComponent } from './dashboard-react-module';
import { CommercialDashboardController } from './dashboard-controller';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, DashboardChartComponent, DashboardTabsComponent, DashboardHeaderComponent, DashboardFiltersComponent, DashboardReactModuleComponent, DashboardAssistantWidgetComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.scss', './transfer-modal.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class App extends CommercialDashboardController {}
