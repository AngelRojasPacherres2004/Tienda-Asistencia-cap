import React from "react";
import CommercialReactSectionHeading from "./CommercialReactSectionHeading";
import CommercialReactRotationCard from "./CommercialReactRotationCard";
import CommercialReactAntiquityCard from "./CommercialReactAntiquityCard";
import CommercialReactStoreValueCard from "./CommercialReactStoreValueCard";
import CommercialReactSizeCard from "./CommercialReactSizeCard";
import CommercialReactPredictiveParameters from "./CommercialReactPredictiveParameters";
import CommercialReactHealthCard from "./CommercialReactHealthCard";
import CommercialReactReplenishmentCard from "./CommercialReactReplenishmentCard";
import CommercialReactProjectionCard from "./CommercialReactProjectionCard";

export default function CommercialReactInventoryPage({ model, onAction, hideTransfers = false, storeAdmin = false }) {
  const forward = source => action => onAction({ ...action, source });
  const heading = key => ({ ...model.headings[key], transferVisible: !hideTransfers && model.headings[key].transferVisible });
  return <section className="page page-two" aria-label="Inventario y analítica predictiva" data-react-commercial-module="inventory-page">
    <CommercialReactSectionHeading model={heading('inventory')} onAction={forward("section")} />
    <CommercialReactSectionHeading model={heading('a')} onAction={forward("section")} />
    <div className="inventory-grid">
      <CommercialReactRotationCard model={model.rotation} onAction={forward("rotation")} />
      <CommercialReactAntiquityCard model={model.antiquity} onAction={forward("antiquity")} />
    </div>
    <CommercialReactSectionHeading model={heading('b')} onAction={forward("section")} />
    <div className="inventory-analysis-row">
      <CommercialReactStoreValueCard model={model.storeValue} onAction={forward("storeValue")} />
      <CommercialReactSizeCard model={model.size} onAction={forward("size")} />
    </div>
    {model.detailState === "error" ? <div className="detail-loader compact detail-loader--error"><strong>No se pudo abrir la analítica por producto.</strong><button type="button" className="retry-button" onClick={() => onAction({ source: "detail", type: "retry" })}>REINTENTAR</button></div>
      : model.detailState === "loading" ? <div className="detail-loader compact stock-product-detail-trigger"><span className="loader" /><strong>Preparando analítica por producto · {model.detailProgress}%</strong></div>
        : <section className="predictive-v2" aria-label="Analítica predictiva de Textil y Calzado">
          <CommercialReactSectionHeading model={heading('c')} onAction={forward("section")} />
          <CommercialReactPredictiveParameters model={model.predictive.parameters} onAction={forward("parameters")} />
          {model.refreshError && <div className="predictive-refresh-error" role="alert"><span>{model.refreshError}</span><button type="button" className="retry-button" onClick={() => onAction({ source: 'detail', type: 'retry' })}>REINTENTAR</button></div>}
          <div className="predictive-overview-grid">
            <CommercialReactHealthCard model={model.predictive.health} />
            <CommercialReactReplenishmentCard model={model.predictive.replenishment} onAction={forward("replenishment")} />
            <CommercialReactProjectionCard model={model.predictive.projection} onAction={forward("projection")} storeView={storeAdmin} />
          </div>
        </section>}
  </section>;
}
