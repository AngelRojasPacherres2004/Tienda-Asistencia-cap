import React from 'react';
import { createRoot } from 'react-dom/client';
import { effect, withReactServices } from '../../commercial-dashboard/src/app/reactivity-react';
import { CloudDataService } from '../../commercial-dashboard/src/app/cloud-data.service';
import { AssistantService } from '../../commercial-dashboard/src/app/assistant.service';
import { CommercialDashboardController } from '../../commercial-dashboard/src/app/dashboard-controller';
import CommercialReactStandalone from './CommercialReactStandalone';
import appStyles from '../../commercial-dashboard/src/app/app.scss?raw';
import transferModalStyles from '../../commercial-dashboard/src/app/transfer-modal.scss?raw';
import globalStyles from '../../commercial-dashboard/src/styles.scss?raw';

export function mountCommercialReactIndependent(host) {
  const shell = document.createElement('app-root');
  host.append(shell);
  const shadow = shell.attachShadow({ mode: 'open' });
  const styles = document.createElement('style');
  styles.textContent = `:host{display:block;width:100%;font-family:"Segoe UI",Arial,sans-serif}\n${globalStyles}\n${appStyles}\n${transferModalStyles}`;
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
