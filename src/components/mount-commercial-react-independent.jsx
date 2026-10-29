import React from 'react';
import { createRoot } from 'react-dom/client';
import { effect, withReactServices } from '../commercial/reactivity-react';
import { CloudDataService } from '../commercial/cloud-data.service';
import { AssistantService } from '../commercial/assistant.service';
import { CommercialDashboardController } from '../commercial/dashboard-controller';
import CommercialReactStandalone from './CommercialReactStandalone';
import appStyles from '../commercial/app.scss?raw';
import transferModalStyles from '../commercial/transfer-modal.scss?raw';
import globalStyles from '../commercial/styles.scss?raw';

export function mountCommercialReactIndependent(host) {
  const shell = document.createElement('app-root');
  host.append(shell);
  const shadow = shell.attachShadow({ mode: 'open' });
  const styles = document.createElement('style');
  styles.textContent = `:host{display:block;width:100%;font-family:"Segoe UI",Arial,sans-serif}\n${appStyles}\n${transferModalStyles}\n${globalStyles}
    @media (min-width:1101px) and (max-width:1899px) { .static-charts > .gender-card:not(.chart-expanded) { height:315px !important; } }
    @media (min-width:1900px) { .static-charts > .gender-card:not(.chart-expanded) { height:360px !important; } }`;
  shadow.append(styles);
  const view = document.createElement('div');
  shadow.append(view);
  const root = createRoot(view);
  const cloud = new CloudDataService();
  const assistant = new AssistantService(cloud);
  const controller = withReactServices([[CloudDataService, cloud], [AssistantService, assistant]],
    () => new CommercialDashboardController());
  const watch = effect(() => { root.render(<CommercialReactStandalone model={controller.reactStandaloneModel()} controller={controller} />); });
  void controller.ngOnInit().catch(error => controller.loadingError.set(
    `No se pudo abrir el dashboard: ${error instanceof Error ? error.message : error}`));
  return () => { watch.destroy(); controller.disposeReactRuntime(); root.unmount(); shell.remove(); };
}
