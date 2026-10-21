import { useEffect, useRef, useState } from "react";
import { Building2 } from "lucide-react";
import { Loading, Notice } from "../components/UI";

export default function CommercialPortal({ user, storeContextId = null, onStoreChange, switchingStore = false }) {
  const host = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let dispose;
    const load = async () => {
      try {
        const response = await fetch("/comercial/index.html", { cache: "no-cache" });
        if (!response.ok) throw new Error("No se pudo cargar el dashboard comercial.");
        const documentHtml = new DOMParser().parseFromString(await response.text(), "text/html");
        const script = documentHtml.querySelector('script[type="module"][src]')?.getAttribute("src");
        const stylesheet = documentHtml.querySelector('link[rel="stylesheet"]')?.getAttribute("href");
        if (!script || !stylesheet) throw new Error("El dashboard comercial necesita compilarse nuevamente.");
        window.__DASHBOARD_CONFIG__ = { dataMode: "portal", groqAssistantEnabled: true, storeContextId };
        await import(/* @vite-ignore */ new URL(script, `${location.origin}/comercial/`).href);
        if (!active) return;
        dispose = await window.mountCommercialDashboard(host.current, new URL(stylesheet, `${location.origin}/comercial/`).href);
        if (!active) dispose();
        else setLoading(false);
      } catch (err) {
        if (active) { setError(err.message); setLoading(false); }
      }
    };
    load();
    return () => { active = false; dispose?.(); };
  }, [storeContextId]);

  return (
    <section className="commercial-portal" aria-label="Dashboard ejecutivo comercial">
      {user?.rol === "jefe_tienda" && user.tiendas_disponibles?.length > 1 && <div className="portal-store-context">
        <div><Building2 size={17} /><span>Vista comercial de</span></div>
        <label><span className="visually-hidden">Cambiar tienda activa</span><select aria-label="Cambiar tienda activa" value={String(user.tienda_id || "")} disabled={switchingStore} onChange={event => onStoreChange?.(event.target.value)}>{user.tiendas_disponibles.map(store => <option key={store.id} value={String(store.id)}>{store.nombre}{store.principal ? " · Principal" : " · Apoyo"}</option>)}</select></label>
        <strong>{user.tienda_id === user.tienda_principal_id ? "Tienda principal" : "Acceso de apoyo"}</strong>
      </div>}
      {loading && <Loading />}
      {error && <Notice type="error">{error}</Notice>}
      <div ref={host} className="commercial-portal-host" />
    </section>
  );
}
