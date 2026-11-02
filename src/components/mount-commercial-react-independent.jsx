import React from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import MiTienda from '../pages/MiTienda';
import CommercialTrafficMatrix from './CommercialTrafficMatrix';
import '../pages/store-commercial-panels.css';
import { effect, withReactServices } from '../commercial/reactivity-react';
import { CloudDataService } from '../commercial/cloud-data.service';
import { AssistantService } from '../commercial/assistant.service';
import { CommercialDashboardController } from '../commercial/dashboard-controller';
import CommercialReactStandalone from './CommercialReactStandalone';
import appStyles from '../commercial/app.scss?raw';
import transferModalStyles from '../commercial/transfer-modal.scss?raw';
import globalStyles from '../commercial/styles.scss?raw';

export function mountCommercialReactIndependent(host, { user, onNavigate } = {}) {
  const shell = document.createElement('app-root');
  host.append(shell);
  // Project operational charts into the shadow shell while preserving their app styles.
  const operationsHosts = user?.rol === 'jefe_tienda' ? Object.fromEntries(['demand', 'attendance', 'training'].map(name => {
    const target = document.createElement('div');
    target.slot = `store-${name}`;
    target.className = 'store-commercial-panels store-dashboard-shell is-light';
    shell.append(target);
    return [name, target];
  })) : null;
  const renderOperations = sections => Object.entries(sections).map(([name, content]) => createPortal(content, operationsHosts[name], name));
  const trafficHost = !operationsHosts ? document.createElement('div') : null;
  if (trafficHost) {
    trafficHost.slot = 'commercial-traffic';
    trafficHost.className = 'store-commercial-panels store-dashboard-shell is-light';
    shell.append(trafficHost);
  }
  const shadow = shell.attachShadow({ mode: 'open' });
  const styles = document.createElement('style');
  styles.textContent = `:host{display:block;width:100%;font-family:"Segoe UI",Arial,sans-serif}\n${appStyles}\n${transferModalStyles}\n${globalStyles}
    @media (min-width:1101px) and (max-width:1899px) { .static-charts > .gender-card:not(.chart-expanded) { height:315px !important; } }
    @media (min-width:1900px) { .static-charts > .gender-card:not(.chart-expanded) { height:360px !important; } }`;
  styles.textContent += '.store-talent-page{display:grid;gap:12px}.store-talent-development{grid-template-columns:repeat(2,minmax(0,1fr))}@media(max-width:800px){.store-talent-development{grid-template-columns:1fr}}';
  if (operationsHosts) styles.textContent += `
    .store-admin-dashboard .dashboard-filter-toolbar { position:fixed; z-index:150; top:50%; right:0; transform:translateY(-50%); transition:right .25s ease; }
    .store-admin-dashboard .dashboard-filter-toolbar .dashboard-filter-trigger,
    .store-admin-dashboard .dashboard-filter-toolbar .dashboard-filter-trigger[aria-expanded="true"] { display:grid; place-items:center; width:46px; height:52px; min-height:52px; padding:0; border:0; border-radius:12px 0 0 12px; color:#fff; background:#123a8c; box-shadow:0 4px 18px #17203340; }
    .store-admin-dashboard .dashboard-filter-toolbar .dashboard-filter-trigger:hover { background:#153e76; }
    .store-admin-dashboard .dashboard-filter-toolbar.is-open { right:min(360px,calc(100vw - 46px)); }
    .store-admin-dashboard .dashboard-filter-drawer { position:fixed; inset:0 0 0 auto; z-index:149; width:min(360px,calc(100vw - 46px)); max-width:100vw; height:100dvh; max-height:100dvh; margin:0; padding:20px; border:0; background:#f8fbff; color:#172033; overflow-y:auto; box-shadow:-12px 0 36px #17203330; transform:translateX(100%); visibility:hidden; transition:transform .25s ease,visibility 0s .25s; }
    .store-admin-dashboard .dashboard-filter-drawer.is-open { transform:translateX(0); visibility:visible; transition-delay:0s; }
    .store-admin-dashboard .dashboard-filter-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .store-admin-dashboard .dashboard-filter-heading h2 { margin:0; font-size:1.15rem; }
    .store-admin-dashboard aside.dashboard-filter-drawer .filter-panel { padding:16px 0; margin:12px 0; border:0; border-radius:0; box-shadow:none; background:transparent; }
    .store-admin-dashboard aside.dashboard-filter-drawer .filters { display:grid; grid-template-columns:minmax(0,1fr); align-items:start; gap:16px; }
    .store-admin-dashboard aside.dashboard-filter-drawer .filters>:is(label,.filter-field,.date-range-filter) { min-width:0; max-width:none; width:100%; }
    .store-admin-dashboard aside.dashboard-filter-drawer .filter-menu { position:relative; top:auto; width:100%; margin-top:6px; box-shadow:none; }
    .store-admin-dashboard aside.dashboard-filter-drawer .calendar-popover { position:relative; inset:auto; width:100%; max-width:100%; margin-top:6px; }
    .store-admin-dashboard aside.dashboard-filter-drawer .calendar-backdrop { display:none; }
    .store-admin-dashboard aside.dashboard-filter-drawer .day-picker-trigger { flex:1; }
    .store-admin-dashboard aside.dashboard-filter-drawer .store-pills { flex-wrap:wrap; justify-content:flex-start; overflow:visible; }
    .store-admin-dashboard .section-heading { gap:12px; margin:12px 0 16px; }
    .store-admin-dashboard .section-heading h2 { font-size:1.3rem; line-height:1.25; letter-spacing:.035em; }
    .store-admin-dashboard .section-heading>span { flex-shrink:0; width:40px; height:40px; font-size:1rem; }
    .store-admin-dashboard .block-heading { gap:10px; margin:18px 0 10px; }
    .store-admin-dashboard .block-heading h2 { font-size:1.05rem; line-height:1.3; letter-spacing:.045em; }
    .store-admin-dashboard .block-heading>span { flex-shrink:0; width:30px; height:30px; font-size:.85rem; }
    .store-talent-page .talent-card:not(.chart-expanded) { height:360px!important; min-height:360px!important; padding:16px; }
    .store-talent-page .talent-card h2 { font-size:16px!important; line-height:1.3; }
    .store-talent-page .talent-overview-grid,.store-talent-page .talent-performance-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .store-talent-page .talent-table>div,.store-talent-page .talent-table strong { font-size:12px; line-height:1.35; padding-block:7px; }
    .store-talent-page .talent-training-switch button { font-size:12px; height:30px; }
    .single-bar-indicator { display:grid; place-items:center; min-height:180px; height:100%; width:100%; }
    .single-bar-indicator>button { display:grid; align-content:center; justify-items:center; gap:14px; width:100%; height:100%; padding:20px; border:0; background:transparent; color:#10243c; cursor:pointer; }
    .single-bar-indicator span { font-size:15px; font-weight:700; color:#334155; }
    .single-bar-indicator strong { font-size:clamp(28px,3vw,42px); line-height:1.2; color:#123a8c; }
    .single-bar-indicator small { max-width:34ch; font-size:12px; line-height:1.5; color:#475569; text-align:center; }
    .single-bar-indicator>button:focus-visible { outline:3px solid #2878d0; outline-offset:-4px; border-radius:8px; }
    @media(max-width:1000px) { .store-talent-page .talent-overview-grid,.store-talent-page .talent-performance-grid { grid-template-columns:1fr; } }
    @media(max-width:600px) { .store-admin-dashboard .section-heading h2 { font-size:1.1rem; } .store-admin-dashboard .block-heading h2 { font-size:.95rem; } }
  `;
  shadow.append(styles);
  const view = document.createElement('div');
  shadow.append(view);
  const root = createRoot(view);
  const cloud = new CloudDataService();
  const assistant = new AssistantService(cloud);
  const controller = withReactServices([[CloudDataService, cloud], [AssistantService, assistant]],
    () => new CommercialDashboardController());
  const watch = effect(() => {
    const model = controller.reactStandaloneModel();
    const selectedPeriod = controller.selectedPeriod();
    const trafficPeriod = { year: String(Math.floor(selectedPeriod / 100)), monthNumber: String(selectedPeriod % 100).padStart(2, '0'), week: '', day: '' };
    root.render(<>
      <CommercialReactStandalone model={model} controller={controller} storeOperations={Boolean(operationsHosts)} />
      {operationsHosts && model.mode === 'ready' && model.page === 3 && <MiTienda user={user} onNavigate={onNavigate} view="commercial" renderSections={renderOperations} />}
      {trafficHost && model.mode === 'ready' && model.page === 3 && createPortal(<CommercialTrafficMatrix user={user} period={trafficPeriod} />, trafficHost)}
    </>);
  });
  void controller.ngOnInit().catch(error => controller.loadingError.set(
    `No se pudo abrir el dashboard: ${error instanceof Error ? error.message : error}`));
  return () => { watch.destroy(); controller.disposeReactRuntime(); root.unmount(); shell.remove(); };
}
