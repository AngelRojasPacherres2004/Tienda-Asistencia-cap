import { bootstrapApplication, createApplication } from '@angular/platform-browser';
import { effect, runInInjectionContext } from '@angular/core';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { CommercialDashboardController } from './app/dashboard-controller';
import { readRuntimeConfig } from './app/runtime-config';

declare global {
  interface Window {
    mountCommercialDashboard: (host: HTMLElement, stylesheet: string) => Promise<() => void>;
  }
}

window.mountCommercialDashboard = async (host, stylesheet) => {
  if (readRuntimeConfig().reactStandalone && window.mountReactCommercialStandalone) {
    const application = await createApplication(appConfig);
    const shell = document.createElement('app-root');
    host.append(shell);
    const shadow = shell.attachShadow({ mode: 'open' });
    const styles = document.createElement('link');
    styles.rel = 'stylesheet';
    styles.href = stylesheet;
    shadow.append(styles);
    try {
      const controller = runInInjectionContext(application.injector, () => new CommercialDashboardController());
      const bridge = window.mountReactCommercialStandalone(shadow, controller);
      const watch = runInInjectionContext(application.injector,
        () => effect(() => bridge.update(controller.reactStandaloneModel())));
      void controller.ngOnInit().catch(error => controller.loadingError.set(
        `No se pudo abrir el dashboard: ${error instanceof Error ? error.message : error}`));
      return () => { watch.destroy(); bridge.dispose(); application.destroy(); shell.remove(); };
    } catch (error) {
      application.destroy();
      shell.remove();
      throw error;
    }
  }
  const application = await createApplication(appConfig);
  try {
    application.bootstrap(App, host);
    const styles = document.createElement('link');
    styles.rel = 'stylesheet';
    styles.href = stylesheet;
    host.shadowRoot!.append(styles);
    return () => application.destroy();
  } catch (error) {
    application.destroy();
    throw error;
  }
};

if (document.querySelector('app-root')) {
  bootstrapApplication(App, appConfig).then(application => {
    const host = document.querySelector('app-root')!;
    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => host.shadowRoot!.append(link.cloneNode()));
    application.onDestroy(() => host.remove());
  }).catch((err) => console.error(err));
}
