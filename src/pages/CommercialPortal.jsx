import { useEffect, useRef, useState } from "react";
import { Building2 } from "lucide-react";
import { Loading, Notice } from "../components/UI";

let commercialBundlePromise;

function loadCommercialBundle() {
  if (commercialBundlePromise) return commercialBundlePromise;
  commercialBundlePromise = (async () => {
    const timeout = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(20000) : undefined;
    const response = await fetch("/comercial/index.html", { cache: "no-cache", signal: timeout });
    if (!response.ok) throw new Error("No se pudo cargar el dashboard comercial.");
    const documentHtml = new DOMParser().parseFromString(await response.text(), "text/html");
    const script = documentHtml.querySelector('script[type="module"][src]')?.getAttribute("src");
    const stylesheet = documentHtml.querySelector('link[rel="stylesheet"]')?.getAttribute("href");
    if (!script || !stylesheet) throw new Error("El dashboard comercial necesita compilarse nuevamente.");
    await import(/* @vite-ignore */ new URL(script, `${location.origin}/comercial/`).href);
    if (typeof window.mountCommercialDashboard !== "function") throw new Error("El dashboard comercial no terminó de iniciar.");
    return { stylesheet: new URL(stylesheet, `${location.origin}/comercial/`).href };
  })().catch(error => {
    commercialBundlePromise = undefined;
    if (["TimeoutError", "AbortError"].includes(error?.name)) throw new Error("El dashboard comercial tardó demasiado en iniciar.");
    throw error;
  });
  return commercialBundlePromise;
}

export default function CommercialPortal({ user, storeContextId = null, onStoreChange, switchingStore = false }) {
  const host = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let dispose;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const bundle = await loadCommercialBundle();
        if (!active) return;
        const supportedReactCharts = new Set(["growth", "meta-vs-real", "hourly-performance", "category-participation", "price-range", "store-ranking", "brand-sales", "gender-donut", "gender-bar", "inventory-rotation", "inventory-capacity", "inventory-store-value", "inventory-sizes", "inventory-antiquity", "talent-history", "talent-team-productivity", "talent-seller-performance", "talent-area-distribution", "talent-store-productivity", "talent-training", "talent-exit", "talent-incidents", "predictive-health", "predictive-replenishment", "predictive-projection", "modal-ticket", "modal-conversion", "modal-traffic"]);
        const reactCharts = (import.meta.env.VITE_COMMERCIAL_REACT_CHARTS || "")
          .split(",").map(value => value.trim()).filter(value => supportedReactCharts.has(value));
        const previewChart = new URLSearchParams(location.search).get("reactChart");
        if (import.meta.env.DEV && supportedReactCharts.has(previewChart)) reactCharts.push(previewChart);
        const supportedReactModules = new Set(["page-tabs", "header", "filters", "primary-kpis", "key-kpis", "progress"]);
        const reactModules = (import.meta.env.VITE_COMMERCIAL_REACT_MODULES || "")
          .split(",").map(value => value.trim()).filter(value => supportedReactModules.has(value));
        const previewModule = new URLSearchParams(location.search).get("reactModule");
        if (import.meta.env.DEV && supportedReactModules.has(previewModule)) reactModules.push(previewModule);
        if (reactCharts.length) {
          const renderer = await import("../components/mount-commercial-react-chart");
          if (!active) return;
          window.mountReactCommercialChart = renderer.mountReactCommercialChart;
        }
        if (reactModules.length) {
          if (reactModules.includes("page-tabs")) {
            const renderer = await import("../components/mount-commercial-react-tabs");
            if (!active) return;
            window.mountReactCommercialTabs = renderer.mountReactCommercialTabs;
          }
          if (reactModules.includes("header")) {
            const renderer = await import("../components/mount-commercial-react-header");
            if (!active) return;
            window.mountReactCommercialHeader = renderer.mountReactCommercialHeader;
          }
          if (reactModules.includes("filters")) {
            const renderer = await import("../components/mount-commercial-react-filters");
            if (!active) return;
            window.mountReactCommercialFilters = renderer.mountReactCommercialFilters;
          }
          if (reactModules.some(moduleId => ["primary-kpis", "key-kpis", "progress"].includes(moduleId))) {
            const renderer = await import("../components/mount-commercial-react-module");
            if (!active) return;
            window.mountReactCommercialModule = renderer.mountReactCommercialModule;
          }
        }
        window.__DASHBOARD_CONFIG__ = {
          dataMode: "portal", groqAssistantEnabled: true, storeContextId,
          reactCharts, reactModules,
          portalUser: { nombres: user?.nombres, apellidos: user?.apellidos },
        };
        dispose = await window.mountCommercialDashboard(host.current, bundle.stylesheet);
        if (!active) dispose();
        else setLoading(false);
      } catch (err) {
        if (active) { setError(err?.message || "No se pudo abrir el dashboard comercial."); setLoading(false); }
      }
    };
    load();
    return () => { active = false; dispose?.(); };
  }, [attempt, storeContextId, user?.apellidos, user?.nombres]);

  return (
    <section className="commercial-portal" aria-label="Dashboard ejecutivo comercial">
      {user?.rol === "jefe_tienda" && user.tiendas_disponibles?.length > 1 && <div className="portal-store-context">
        <div><Building2 size={17} /><span>Vista comercial de</span></div>
        <label><span className="visually-hidden">Cambiar tienda activa</span><select aria-label="Cambiar tienda activa" value={String(user.tienda_id || "")} disabled={switchingStore} onChange={event => onStoreChange?.(event.target.value)}>{user.tiendas_disponibles.map(store => <option key={store.id} value={String(store.id)}>{store.nombre}{store.principal ? " · Principal" : " · Apoyo"}</option>)}</select></label>
        <strong>{user.tienda_id === user.tienda_principal_id ? "Tienda principal" : "Acceso de apoyo"}</strong>
      </div>}
      {loading && <Loading label="Preparando dashboard comercial…" />}
      {error && <div className="commercial-load-error"><Notice type="error">{error}</Notice><button type="button" className="button button--ghost" onClick={() => setAttempt(value => value + 1)}>Reintentar</button></div>}
      <div ref={host} className="commercial-portal-host" />
    </section>
  );
}
