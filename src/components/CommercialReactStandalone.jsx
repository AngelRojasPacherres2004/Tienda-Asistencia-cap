import React from "react";
import CommercialReactAccessState from "./CommercialReactAccessState";
import CommercialReactHeader from "./CommercialReactHeader";
import CommercialReactFilters from "./CommercialReactFilters";
import CommercialReactTabs from "./CommercialReactTabs";
import CommercialReactCommercialPage from "./CommercialReactCommercialPage";
import CommercialReactInventoryPage from "./CommercialReactInventoryPage";
import CommercialReactTalentPage from "./CommercialReactTalentPage";
import CommercialReactBirthdayModal from "./CommercialReactBirthdayModal";
import CommercialReactTransferModal from "./CommercialReactTransferModal";
import CommercialReactStockOriginModal from "./CommercialReactStockOriginModal";
import CommercialReactMonthlyModal from "./CommercialReactMonthlyModal";
import CommercialReactAssistantController from "./CommercialReactAssistantController";

export default function CommercialReactStandalone({ model, controller }) {
  const accessAction = action => controller.onReactCommercialAccessAction(action);
  if (model.mode !== "ready") return <main className="app-shell portal-embed" data-react-commercial-shell="true">
    <CommercialReactAccessState model={model.access} onAction={accessAction} />
  </main>;

  const modal = model.modal;
  return <main className="app-shell portal-embed" data-react-commercial-shell="true">
    {model.expanded && <button type="button" className="chart-backdrop" aria-label="Cerrar gráfico ampliado" onClick={() => controller.closeExpandedChart()} />}
    {modal?.type === "birthday" && <CommercialReactBirthdayModal model={modal.model} onAction={action => controller.onReactBirthdayAction(action)} />}
    {modal?.type === "transfer" && <CommercialReactTransferModal model={modal.model} onAction={action => controller.onReactTransferAction(action)} />}
    {modal?.type === "stock-origin" && <CommercialReactStockOriginModal model={modal.model} onAction={action => controller.onReactStockOriginModalAction(action)} />}
    {modal?.type === "monthly" && <CommercialReactMonthlyModal model={modal.model} onAction={action => controller.onReactMonthlyModalAction(action)} />}
    <CommercialReactHeader model={model.header} onLogout={() => controller.signOut()} />
    <CommercialReactFilters model={model.filters} onAction={action => controller.onReactFilterAction(action)} />
    <CommercialReactTabs page={model.page} onNavigate={page => controller.goPage(page)} />
    {model.page === 1 && <CommercialReactCommercialPage model={model.commercial} onAction={action => controller.onReactCommercialPageAction(action)} />}
    {model.page === 2 && <CommercialReactInventoryPage model={model.inventory} onAction={action => controller.onReactInventoryPageAction(action)} />}
    {model.page === 3 && <CommercialReactTalentPage model={model.talent} onAction={action => controller.onReactTalentPageAction(action)} />}
    {model.assistantEnabled && <CommercialReactAssistantController role={model.assistantRole} context={model.assistantContext} controller={controller} />}
  </main>;
}
