import { bootstrapApplication, createApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

declare global {
  interface Window {
    mountCommercialDashboard: (host: HTMLElement, stylesheet: string) => Promise<() => void>;
  }
}

window.mountCommercialDashboard = async (host, stylesheet) => {
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
